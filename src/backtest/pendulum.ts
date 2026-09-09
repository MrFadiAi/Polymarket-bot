/**
 * Pendulum Flow V3 → Backtest snapshots.
 *
 * Real V3 hour files (e.g. `2026-09-09T06.parquet`, ~900MB) have one row
 * per event with columns:
 *   event_type  — price_change | best_bid_ask | book | last_trade_price | ...
 *   timestamp   — TIMESTAMPTZ
 *   market      — BLOB, shared by the YES/NO pair of a market
 *   asset_id    — BLOB, 32-byte big-endian uint256 (the CTF token ID)
 *   best_bid / best_ask — touch (on `best_bid_ask` rows)
 *   bids / asks — STRUCT(price, size)[] full depth (on `book` rows)
 *
 * Supported pipeline (DuckDB CLI does the heavy lifting, this module owns
 * the touch/depth logic — verified against real hour-06 data 2026-09-09):
 * ```sql
 * COPY (
 *   SELECT epoch_ms(timestamp) AS ts_ms, hex(market) AS market,
 *          hex(asset_id) AS asset, bids, asks
 *   FROM '2026-09-09T06.parquet'
 *   WHERE event_type = 'book' AND market = unhex('<marketHex>')
 *   ORDER BY timestamp
 * ) TO 'rows.json' (FORMAT JSON);
 * ```
 * `hex()` emits UPPERCASE; asset IDs are normalized to lowercase here, so
 * `--yes/--no` accept either case (or decimal CTF token IDs, converted).
 */

import type { BacktestSnapshot } from './types.js';
import type { PriceLevel } from '../utils/price-utils.js';

export interface PendulumBookRow {
  ts_ms: number;
  market: string;
  asset: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
}

/** 32-byte asset hex → decimal CTF token ID (as used by the Gamma/CLOB APIs). */
export function assetHexToTokenId(hexId: string): string {
  return BigInt(hexId.startsWith('0x') ? hexId : `0x${hexId}`).toString(10);
}

/** Accept `0x`-prefixed, upper/lower hex or decimal token IDs; return lowercase hex. */
export function normalizeAssetId(id: string): string {
  const t = id.trim();
  if (/^\d+$/.test(t)) return BigInt(t).toString(16).padStart(64, '0');
  return t.replace(/^0x/i, '').toLowerCase();
}

function topLevels(
  raw: Array<{ price: number; size: number }>,
  side: 'ask' | 'bid',
  maxLevels: number
): PriceLevel[] {
  const byPrice = new Map<number, number>();
  for (const l of raw ?? []) {
    if (!Number.isFinite(l?.price) || !Number.isFinite(l?.size) || l.size <= 0) continue;
    byPrice.set(l.price, (byPrice.get(l.price) ?? 0) + l.size);
  }
  const sorted = [...byPrice.entries()].sort((a, b) =>
    side === 'ask' ? a[0] - b[0] : b[0] - a[0]
  );
  return sorted
    .slice(0, Math.max(1, maxLevels))
    .map(([price, size]) => ({ price, size }));
}

/**
 * Pair `book` rows (same `ts_ms`, one row per asset) into snapshots.
 * A bucket is kept only when BOTH assets expose a non-empty ask ladder —
 * without both asks the YES+NO pair cannot be priced (a 0/missing ask
 * would fabricate an arb edge). Buckets with empty books on both sides
 * are likewise skipped.
 */
export function pendulumBookRowsToSnapshots(
  rows: PendulumBookRow[],
  yesAsset: string,
  noAsset: string,
  opts: { maxLevels?: number } = {}
): BacktestSnapshot[] {
  const yes = normalizeAssetId(yesAsset);
  const no = normalizeAssetId(noAsset);
  const maxLevels = opts.maxLevels ?? 10;

  const buckets = new Map<number, PendulumBookRow[]>();
  for (const r of rows) {
    if (!r || !Number.isFinite(r.ts_ms)) continue;
    const asset = typeof r.asset === 'string' ? r.asset.toLowerCase() : '';
    if (asset !== yes && asset !== no) continue;
    const b = buckets.get(r.ts_ms);
    if (b) b.push(r);
    else buckets.set(r.ts_ms, [r]);
  }

  const out: BacktestSnapshot[] = [];
  for (const ts of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(ts)!;
    const yRow = b.find((r) => r.asset.toLowerCase() === yes);
    const nRow = b.find((r) => r.asset.toLowerCase() === no);
    if (!yRow || !nRow) continue;
    const yesAsks = topLevels(yRow.asks, 'ask', maxLevels);
    const noAsks = topLevels(nRow.asks, 'ask', maxLevels);
    if (yesAsks.length === 0 || noAsks.length === 0) continue;
    const yesBids = topLevels(yRow.bids, 'bid', maxLevels);
    const noBids = topLevels(nRow.bids, 'bid', maxLevels);
    out.push({
      ts,
      yesAsk: yesAsks[0].price,
      yesBid: yesBids[0]?.price ?? 0,
      noAsk: noAsks[0].price,
      noBid: noBids[0]?.price ?? 0,
      yesAskSize: yesAsks[0].size,
      yesBidSize: yesBids[0]?.size,
      noAskSize: noAsks[0].size,
      noBidSize: noBids[0]?.size,
      levels: { yesAsks, yesBids, noAsks, noBids },
    });
  }
  return out;
}

/**
 * Parse DuckDB row output: NDJSON (`COPY ... (FORMAT JSON)` writes one
 * object per line) or a JSON array. Throws on invalid input.
 */
export function parseBookRowsText(text: string): PendulumBookRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of rows');
    return parsed as PendulumBookRow[];
  }
  return trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PendulumBookRow);
}

/** Serialize snapshots to JSONL for `npm run backtest -- snapshots.jsonl`. */
export function snapshotsToJsonl(snapshots: BacktestSnapshot[]): string {
  return snapshots.map((s) => JSON.stringify(s)).join('\n') + (snapshots.length ? '\n' : '');
}

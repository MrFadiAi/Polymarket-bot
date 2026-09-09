/**
 * Touch-stream arb decay — how long does a top-of-book edge survive?
 *
 * `scanArbAvailability` answers this at sparse `book`-snapshot granularity.
 * This module replays the dense `best_bid_ask` touch stream (~50 ticks/sec
 * per market observed) to answer the executability question: if an edge is
 * visible now, is it still there N ms later when our poll would fire?
 *
 * Real `best_bid_ask` rows (verified against hour-06 data 2026-09-09):
 *   timestamp TIMESTAMPTZ, market BLOB, asset_id BLOB,
 *   best_bid / best_ask DECIMAL(9,4) (never NULL in the probed market),
 *   spread DECIMAL(9,4). Both assets of a market emit at identical ms
 *   timestamps, so pairing is exact-ms — unpaired ticks are dropped and
 *   never fabricated (same rule as `pendulumBookRowsToSnapshots`).
 *
 * Supported pipeline (DuckDB CLI does the heavy lifting):
 * ```sql
 * COPY (
 *   SELECT epoch_ms(timestamp) AS ts_ms, hex(market) AS market,
 *          hex(asset_id) AS asset, CAST(best_bid AS DOUBLE) AS best_bid,
 *          CAST(best_ask AS DOUBLE) AS best_ask
 *   FROM '2026-09-09T06.parquet'
 *   WHERE event_type = 'best_bid_ask' AND market = unhex('<marketHex>')
 *   ORDER BY timestamp
 * ) TO 'touches.json' (FORMAT JSON);
 * ```
 */

import { normalizeAssetId } from './pendulum.js';
import { snapshotEdge } from './availability.js';

export interface PendulumTouchRow {
  ts_ms: number;
  market: string;
  asset: string;
  best_bid: number | null;
  best_ask: number | null;
}

export interface TouchTick {
  ts: number;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  /** Long-arb edge at the touch: 1 - (yesAsk + noAsk), via `snapshotEdge`. */
  edge: number;
}

export const DEFAULT_DECAY_HORIZONS_MS = [100, 250, 500, 1000, 2000, 5000];

/**
 * Parse DuckDB touch output: NDJSON (`COPY ... (FORMAT JSON)`) or array.
 * Throws on invalid input.
 */
export function parseTouchRowsText(text: string): PendulumTouchRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of rows');
    return parsed as PendulumTouchRow[];
  }
  return trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PendulumTouchRow);
}

function validTouch(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Pair touch rows (same `ts_ms`, one row per asset) into ticks. A bucket is
 * kept only when BOTH assets expose a positive best ask — without both asks
 * the pair cannot be priced.
 */
export function touchRowsToTicks(
  rows: PendulumTouchRow[],
  yesAsset: string,
  noAsset: string
): TouchTick[] {
  const yes = normalizeAssetId(yesAsset);
  const no = normalizeAssetId(noAsset);

  const buckets = new Map<number, PendulumTouchRow[]>();
  for (const r of rows) {
    if (!r || !Number.isFinite(r.ts_ms)) continue;
    const asset = typeof r.asset === 'string' ? r.asset.toLowerCase() : '';
    if (asset !== yes && asset !== no) continue;
    const b = buckets.get(r.ts_ms);
    if (b) b.push(r);
    else buckets.set(r.ts_ms, [r]);
  }

  const out: TouchTick[] = [];
  for (const ts of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(ts)!;
    const yRow = b.find((r) => r.asset.toLowerCase() === yes);
    const nRow = b.find((r) => r.asset.toLowerCase() === no);
    if (!yRow || !nRow) continue;
    if (!validTouch(yRow.best_ask) || !validTouch(nRow.best_ask)) continue;
    const base = {
      ts,
      yesBid: validTouch(yRow.best_bid) ? yRow.best_bid : 0,
      yesAsk: yRow.best_ask,
      noBid: validTouch(nRow.best_bid) ? nRow.best_bid : 0,
      noAsk: nRow.best_ask,
    };
    out.push({ ...base, edge: snapshotEdge({ ...base, yesAskSize: 0 }) });
  }
  return out;
}

export interface EdgeEpisode {
  startTs: number;
  startEdge: number;
  /** ms until edge first drops to/below threshold; null if still open at EOF. */
  decayMs: number | null;
  /** Edge at the first tick at/after startTs + h, per horizon (NaN past EOF). */
  edgeAtHorizon: number[];
}

/**
 * Trace edge episodes in one pass: an episode opens on the first tick with
 * edge above threshold and closes on the first tick at/below it
 * (`>` mirrors `scanArbAvailability`).
 */
export function traceEdgeEpisodes(
  ticks: TouchTick[],
  opts: { threshold?: number; horizonsMs?: number[] } = {}
): EdgeEpisode[] {
  const threshold = opts.threshold ?? 0;
  const horizons = opts.horizonsMs ?? DEFAULT_DECAY_HORIZONS_MS;
  const sorted = [...ticks].sort((a, b) => a.ts - b.ts);
  const out: EdgeEpisode[] = [];

  let open: { startIdx: number } | null = null;
  const close = (endIdx: number, decayed: boolean): void => {
    const start = sorted[open!.startIdx];
    const edgeAtHorizon = horizons.map((h) => {
      const target = start.ts + h;
      for (let j = open!.startIdx; j < sorted.length; j++) {
        if (sorted[j].ts >= target) return sorted[j].edge;
      }
      return NaN;
    });
    out.push({
      startTs: start.ts,
      startEdge: start.edge,
      decayMs: decayed ? sorted[endIdx].ts - start.ts : null,
      edgeAtHorizon,
    });
    open = null;
  };

  for (let i = 0; i < sorted.length; i++) {
    if (open) {
      if (sorted[i].edge <= threshold) close(i, true);
    } else if (sorted[i].edge > threshold) {
      open = { startIdx: i };
    }
  }
  if (open) close(sorted.length - 1, false);
  return out;
}

export interface HorizonSurvival {
  horizonMs: number;
  episodes: number;
  meanEdge: number;
  medianEdge: number;
  /** Fraction of observable episodes still above threshold at this horizon. */
  survivalFrac: number;
}

export interface DecaySummary {
  ticks: number;
  episodes: number;
  decayed: number;
  medianDecayMs: number;
  horizons: HorizonSurvival[];
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export function summarizeDecay(
  ticks: TouchTick[],
  episodes: EdgeEpisode[],
  opts: { threshold?: number; horizonsMs?: number[] } = {}
): DecaySummary {
  const threshold = opts.threshold ?? 0;
  const horizons = opts.horizonsMs ?? DEFAULT_DECAY_HORIZONS_MS;
  const decayed = episodes.filter((e) => e.decayMs !== null);
  return {
    ticks: ticks.length,
    episodes: episodes.length,
    decayed: decayed.length,
    medianDecayMs: median(decayed.map((e) => e.decayMs as number)),
    horizons: horizons.map((h, i) => {
      const edges = episodes
        .map((e) => e.edgeAtHorizon[i])
        .filter((v) => Number.isFinite(v));
      return {
        horizonMs: h,
        episodes: edges.length,
        meanEdge: edges.length ? edges.reduce((s, v) => s + v, 0) / edges.length : 0,
        medianEdge: median(edges),
        survivalFrac: edges.length ? edges.filter((v) => v > threshold).length / edges.length : 0,
      };
    }),
  };
}

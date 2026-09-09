/**
 * Cross-market arb discovery — find price divergences between markets that
 * should track the same event (relistings / mirror markets sharing
 * question + end + start, found via the markets.csv grouping probe).
 *
 * Method: bucket fills per market into time buckets (VWAP), align buckets
 * present in both legs of a candidate pair, flag buckets where |a-b| meets
 * the divergence threshold. A pair that never diverges is either efficient
 * or not the same event — both are reported, not hidden.
 *
 * Candidate pairs come from metadata (see scripts/backtest/xmarket.ts);
 * this module holds the pure price-comparison logic. Pairwise cost is
 * O(pairs × buckets) — callers cap the candidate list.
 */

export interface PriceFill {
  market_id: string;
  ts: number;
  price: number;
  qty: number;
  /** poly_data nonusdc_side ("token1"/"token2"); token2 normalizes to 1-price. */
  side?: string;
}

/**
 * Normalize to token1-equivalent price. Assumes token1 is the same outcome
 * across duplicate markets (first clobTokenId, typically YES).
 */
export function toToken1Price(price: number, side?: string): number {
  return side === 'token2' ? 1 - price : price;
}

export interface Divergence {
  marketA: string;
  marketB: string;
  bucketTs: number;
  vwapA: number;
  vwapB: number;
  diff: number;
}

export interface PairSummary {
  marketA: string;
  marketB: string;
  overlapBuckets: number;
  divergedBuckets: number;
  maxAbsDiff: number;
  divergences: Divergence[];
}

/** Per-market time-bucketed VWAP series. */
export function bucketVwap(fills: PriceFill[], bucketMs: number): Map<string, Map<number, number>> {
  const acc = new Map<string, Map<number, { pv: number; q: number }>>();
  for (const f of fills) {
    if (!Number.isFinite(f.price) || !(f.qty > 0) || !Number.isFinite(f.ts)) continue;
    const price = toToken1Price(f.price, f.side);
    if (!Number.isFinite(price)) continue;
    const b = Math.floor(f.ts / bucketMs);
    let m = acc.get(f.market_id);
    if (!m) {
      m = new Map();
      acc.set(f.market_id, m);
    }
    const e = m.get(b) ?? { pv: 0, q: 0 };
    e.pv += price * f.qty;
    e.q += f.qty;
    m.set(b, e);
  }
  const out = new Map<string, Map<number, number>>();
  for (const [mkt, buckets] of acc) {
    const s = new Map<number, number>();
    for (const [b, e] of buckets) if (e.q > 0) s.set(b, e.pv / e.q);
    out.set(mkt, s);
  }
  return out;
}

/** Align two VWAP series on shared buckets; flag divergences >= threshold. */
export function scanPair(
  marketA: string,
  marketB: string,
  series: Map<string, Map<number, number>>,
  bucketMs: number,
  threshold: number
): PairSummary {
  const a = series.get(marketA) ?? new Map<number, number>();
  const b = series.get(marketB) ?? new Map<number, number>();
  const divergences: Divergence[] = [];
  let overlap = 0;
  let maxAbs = 0;
  for (const [bucket, va] of a) {
    const vb = b.get(bucket);
    if (vb === undefined) continue;
    overlap++;
    const diff = va - vb;
    if (Math.abs(diff) > maxAbs) maxAbs = Math.abs(diff);
    if (Math.abs(diff) >= threshold) {
      divergences.push({ marketA, marketB, bucketTs: bucket * bucketMs, vwapA: va, vwapB: vb, diff });
    }
  }
  divergences.sort((x, y) => x.bucketTs - y.bucketTs);
  return {
    marketA,
    marketB,
    overlapBuckets: overlap,
    divergedBuckets: divergences.length,
    maxAbsDiff: maxAbs,
    divergences,
  };
}

/** All unordered pairs within each candidate group. */
export function pairsInGroups(groups: string[][]): [string, string][] {
  const out: [string, string][] = [];
  for (const g of groups) {
    const ids = [...new Set(g)];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
    }
  }
  return out;
}

export function scanGroups(
  fills: PriceFill[],
  groups: string[][],
  opts: { bucketMs?: number; threshold?: number } = {}
): PairSummary[] {
  const bucketMs = opts.bucketMs ?? 60_000;
  const threshold = opts.threshold ?? 0.02;
  const series = bucketVwap(fills, bucketMs);
  return pairsInGroups(groups)
    .map(([a, b]) => scanPair(a, b, series, bucketMs, threshold))
    .sort((x, y) => y.maxAbsDiff - x.maxAbsDiff);
}

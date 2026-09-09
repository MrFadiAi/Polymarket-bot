import { describe, it, expect } from 'vitest';
import { bucketVwap, scanPair, scanGroups, pairsInGroups, toToken1Price, type PriceFill } from './xmarket.js';

function fill(market_id: string, ts: number, price: number, qty = 10): PriceFill {
  return { market_id, ts, price, qty };
}

describe('bucketVwap', () => {
  it('computes qty-weighted prices per bucket', () => {
    const s = bucketVwap(
      [fill('a', 1000, 0.4, 1), fill('a', 2000, 0.6, 3), fill('a', 61_000, 0.9, 1)],
      60_000
    );
    expect(s.get('a')!.get(0)).toBeCloseTo(0.55, 10);
    expect(s.get('a')!.get(1)).toBeCloseTo(0.9, 10);
  });

  it('skips bad fills', () => {
    const s = bucketVwap([fill('a', 1000, NaN), fill('a', 1000, 0.5, 0)], 60_000);
    expect(s.get('a')).toBeUndefined();
  });
});

describe('scanPair', () => {
  const fills = [
    fill('a', 1000, 0.5),
    fill('b', 2000, 0.5),
    fill('a', 61_000, 0.5),
    fill('b', 62_000, 0.56),
    fill('a', 121_000, 0.5), // no b leg here
  ];

  it('flags only buckets present in both legs past threshold', () => {
    const series = bucketVwap(fills, 60_000);
    const r = scanPair('a', 'b', series, 60_000, 0.02);
    expect(r.overlapBuckets).toBe(2);
    expect(r.divergedBuckets).toBe(1);
    expect(r.divergences[0].diff).toBeCloseTo(-0.06, 10);
    expect(r.maxAbsDiff).toBeCloseTo(0.06, 10);
  });

  it('reports zero overlap for disjoint series', () => {
    const series = bucketVwap([fill('a', 1000, 0.5)], 60_000);
    const r = scanPair('a', 'b', series, 60_000, 0.02);
    expect(r.overlapBuckets).toBe(0);
    expect(r.maxAbsDiff).toBe(0);
  });
});

describe('toToken1Price', () => {
  it('maps token2 to its complement, leaves token1 alone', () => {
    expect(toToken1Price(0.99, 'token2')).toBeCloseTo(0.01, 10);
    expect(toToken1Price(0.5, 'token1')).toBe(0.5);
    expect(toToken1Price(0.5, undefined)).toBe(0.5);
  });

  it('kills the token1-vs-token2 false divergence', () => {
    const fills: PriceFill[] = [
      { market_id: 'a', ts: 1000, price: 0.5, qty: 10, side: 'token1' },
      { market_id: 'b', ts: 1000, price: 0.5, qty: 10, side: 'token2' },
    ];
    const [r] = scanGroups(fills, [['a', 'b']], { bucketMs: 60_000, threshold: 0.02 });
    expect(r.overlapBuckets).toBe(1);
    expect(r.divergedBuckets).toBe(0);
    expect(r.maxAbsDiff).toBeCloseTo(0, 10);
  });
});
describe('scanGroups', () => {
  it('expands groups to pairs and sorts by max diff', () => {
    const fills = [
      fill('a', 1000, 0.5),
      fill('b', 1000, 0.5),
      fill('c', 1000, 0.9),
    ];
    const out = scanGroups(fills, [['a', 'b', 'c']], { bucketMs: 60_000, threshold: 0.02 });
    expect(out).toHaveLength(3);
    expect(out[0].maxAbsDiff).toBeCloseTo(0.4, 10);
    expect(out[2].divergedBuckets).toBe(0);
  });

  it('pairsInGroups dedupes and skips singletons', () => {
    expect(pairsInGroups([['a'], ['b', 'b', 'c']])).toEqual([['b', 'c']]);
  });
});

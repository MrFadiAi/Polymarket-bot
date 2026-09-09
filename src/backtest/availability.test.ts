import { describe, it, expect } from 'vitest';
import { fokFillRates, DEFAULT_FOK_SIZES } from './availability.js';
import type { BacktestSnapshot } from './types.js';

function snap(ts: number, yesDepth: number, noDepth: number): BacktestSnapshot {
  const lad = (d: number) => (d > 0 ? [{ price: 0.5, size: d }] : []);
  return {
    ts,
    yesAsk: 0.5,
    yesBid: 0.49,
    noAsk: 0.5,
    noBid: 0.49,
    levels: { yesAsks: lad(yesDepth), yesBids: [], noAsks: lad(noDepth), noBids: [] },
  };
}

function touchOnly(ts: number): BacktestSnapshot {
  return { ts, yesAsk: 0.5, yesBid: 0.49, noAsk: 0.5, noBid: 0.49 };
}

describe('fokFillRates', () => {
  it('measures pair-fillable fraction per size', () => {
    const snaps = [snap(1, 100, 100), snap(2, 10, 100), snap(3, 100, 5)];
    const rates = fokFillRates(snaps, [5, 50]);
    expect(rates).toHaveLength(2);
    // size 5: all three fillable; size 50: only the first
    expect(rates[0]).toMatchObject({ sizeShares: 5, snapshots: 3, pairFillable: 3, fillRate: 1 });
    expect(rates[1]).toMatchObject({ sizeShares: 50, snapshots: 3, pairFillable: 1 });
    expect(rates[1].fillRate).toBeCloseTo(1 / 3, 10);
  });

  it('excludes touch-only snapshots', () => {
    const rates = fokFillRates([snap(1, 100, 100), touchOnly(2)], [10]);
    expect(rates[0].snapshots).toBe(1);
    expect(rates[0].fillRate).toBe(1);
  });

  it('returns zero rates for empty input', () => {
    const rates = fokFillRates([], [10]);
    expect(rates[0]).toMatchObject({ snapshots: 0, pairFillable: 0, fillRate: 0 });
  });

  it('defaults to standard size ladder', () => {
    expect(DEFAULT_FOK_SIZES).toEqual([5, 10, 25, 50, 100]);
    expect(fokFillRates([snap(1, 1000, 1000)])).toHaveLength(5);
  });
});

import { describe, it, expect } from 'vitest';
import { runDirectBacktest, DEFAULT_DIRECT } from './direct.js';
import type { BacktestSnapshot } from './types.js';

function snap(ts: number, yesAsk: number, yesBid: number, size = 1000): BacktestSnapshot {
  return { ts, yesAsk, yesBid, noAsk: 0.6, noBid: 0.59, yesAskSize: size, yesBidSize: size };
}

describe('runDirectBacktest', () => {
  it('exits at take-profit when the bid rises 25%', () => {
    const { rounds } = runDirectBacktest([snap(0, 0.4, 0.39), snap(1000, 0.5, 0.5)]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].exit).toBe('take-profit');
    // $5 / 0.40 = 12.5 shares, sold at 0.50
    expect(rounds[0].pnl).toBeCloseTo(12.5 * 0.5 - 5, 10);
  });

  it('stops out when the bid falls 15%', () => {
    const { rounds } = runDirectBacktest([snap(0, 0.4, 0.39), snap(1000, 0.35, 0.34)]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].exit).toBe('stopped');
    expect(rounds[0].pnl).toBeCloseTo(12.5 * 0.34 - 5, 10);
  });

  it('trails the peak: 10% below the high exits even without TP/SL', () => {
    const { rounds } = runDirectBacktest([
      snap(0, 0.4, 0.39),
      snap(1000, 0.43, 0.42),
      snap(2000, 0.49, 0.48),
      snap(3000, 0.44, 0.432), // exactly 10% below the 0.48 peak
    ]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].exit).toBe('trailing');
  });

  it('expires on max hold time', () => {
    const { rounds } = runDirectBacktest(
      [snap(0, 0.4, 0.4), snap(5000, 0.41, 0.41)],
      { maxHoldDays: 0.00001 } // <1s
    );
    expect(rounds).toHaveLength(1);
    expect(rounds[0].exit).toBe('expired');
  });

  it('aborts entry when the ask ladder cannot fill the full size (FOK)', () => {
    const { rounds } = runDirectBacktest([
      snap(0, 0.4, 0.39, 1), // only 1 share resting, need 12.5
      snap(1000, 0.4, 0.41, 1000),
      snap(2000, 0.5, 0.5, 1000),
    ]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].entryTs).toBe(1000);
    expect(rounds[0].exit).toBe('take-profit');
  });

  it('force-expires an open position at end of data', () => {
    const { rounds } = runDirectBacktest([snap(0, 0.4, 0.39)]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].exit).toBe('expired');
    expect(rounds[0].pnl).toBeCloseTo(12.5 * 0.39 - 5, 10);
  });

  it('returns zero rounds for empty input', () => {
    const report = runDirectBacktest([]);
    expect(report.rounds).toHaveLength(0);
    expect(report.metrics.trades).toBe(0);
  });

  it('defaults mirror bot-config directTrading', () => {
    expect(DEFAULT_DIRECT).toEqual({
      stopLossPct: 0.15,
      takeProfitPct: 0.25,
      trailingStopPct: 0.1,
      maxHoldDays: 7,
      notionalUsd: 5,
    });
  });
});

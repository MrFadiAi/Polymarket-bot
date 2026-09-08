/**
 * Backtest Engine Unit Tests (PROBLEMS.md P11)
 */

import { describe, it, expect } from 'vitest';
import { longArbStrategy, parseSnapshotsJsonl, runBacktest } from './replay.js';
import { summarizeTrades } from './metrics.js';
import type { BacktestSnapshot } from './types.js';

const ARB_SNAP: BacktestSnapshot = {
  ts: 1,
  yesAsk: 0.45,
  yesBid: 0.44,
  noAsk: 0.45,
  noBid: 0.44,
  yesAskSize: 100,
  noAskSize: 100,
  yesBidSize: 100,
  noBidSize: 100,
};

const FLAT_SNAP: BacktestSnapshot = {
  ts: 2,
  yesAsk: 0.55,
  yesBid: 0.54,
  noAsk: 0.46,
  noBid: 0.45,
  yesAskSize: 100,
  noAskSize: 100,
  yesBidSize: 100,
  noBidSize: 100,
};

describe('longArbStrategy', () => {
  it('signals long when YES+NO cost < $1', () => {
    expect(longArbStrategy(ARB_SNAP, 0)).toEqual({
      type: 'long',
      size: Number.POSITIVE_INFINITY,
    });
  });

  it('stays flat without edge', () => {
    expect(longArbStrategy(FLAT_SNAP, 0)).toEqual({ type: 'flat', size: 0 });
  });
});

describe('runBacktest', () => {
  it('fills long arb at the touch with fee and gas deducted', () => {
    const { trades, metrics } = runBacktest([ARB_SNAP], (s, i) => longArbStrategy(s, i), {
      startingEquity: 250,
      feeRateBps: 0,
      gasCostUsd: 0.1,
      maxTradeSize: 20,
    });
    expect(trades).toHaveLength(1);
    // cost 0.90 * 20 = 18, exit 20 → pnl 2 - 0.1 gas
    expect(trades[0].pnl).toBeCloseTo(1.9, 10);
    expect(metrics.trades).toBe(1);
    expect(metrics.totalPnl).toBeCloseTo(1.9, 10);
  });

  it('skips signals below the net-profit gate', () => {
    const { trades } = runBacktest([ARB_SNAP], (s, i) => longArbStrategy(s, i), {
      gasCostUsd: 0.1,
      maxTradeSize: 20,
      minNetProfitUsd: 5,
    });
    expect(trades).toHaveLength(0);
  });

  it('clamps size to available depth', () => {
    const thin = { ...ARB_SNAP, yesAskSize: 5, noAskSize: 5 };
    const { trades } = runBacktest([thin], (s, i) => longArbStrategy(s, i), {
      gasCostUsd: 0,
      maxTradeSize: 20,
    });
    expect(trades).toHaveLength(1);
    expect(trades[0].size).toBe(5);
  });
});

describe('parseSnapshotsJsonl', () => {
  it('parses lines and skips blanks', () => {
    const snaps = parseSnapshotsJsonl(`${JSON.stringify(ARB_SNAP)}\n\n${JSON.stringify(FLAT_SNAP)}\n`);
    expect(snaps).toHaveLength(2);
    expect(snaps[0].yesAsk).toBe(0.45);
  });
});

describe('summarizeTrades', () => {
  it('computes win rate, profit factor, and drawdown', () => {
    const m = summarizeTrades(
      [
        { ts: 1, type: 'long', size: 10, entryCost: 9, exitValue: 10, feeUsd: 0, gasUsd: 0, pnl: 1 },
        { ts: 2, type: 'long', size: 10, entryCost: 9.5, exitValue: 10, feeUsd: 0, gasUsd: 0, pnl: 0.5 },
        { ts: 3, type: 'long', size: 10, entryCost: 10.5, exitValue: 10, feeUsd: 0, gasUsd: 0, pnl: -0.5 },
      ],
      100
    );
    expect(m.trades).toBe(3);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(1);
    expect(m.winRate).toBeCloseTo(2 / 3, 10);
    expect(m.totalPnl).toBeCloseTo(1, 10);
    expect(m.profitFactor).toBeCloseTo(1.5 / 0.5, 10);
    expect(m.maxDrawdown).toBeGreaterThan(0);
    expect(m.equity).toHaveLength(4);
  });
});

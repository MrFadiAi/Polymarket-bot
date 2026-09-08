/**
 * Risk Utilities Unit Tests (PROBLEMS.md P6, P7, P13)
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePositionSize,
  shouldPauseForLossStreak,
  evaluateWalletQuality,
  computeWalletQualityFromPositions,
  checkExposure,
} from './risk.js';

const LIMITS = {
  enableDynamicSizing: true,
  minPositionPct: 0.01,
  maxPositionPct: 0.05,
  lossSizingReduction: 0.2,
  winSizingIncrease: 0.1,
  minOrderUsd: 5,
};

describe('calculatePositionSize', () => {
  it('returns base size with no streak', () => {
    expect(
      calculatePositionSize(
        0.03,
        { consecutiveLosses: 0, consecutiveWins: 0, capitalUsd: 250 },
        LIMITS
      )
    ).toBeCloseTo(0.03, 10);
  });

  it('decays 0.8x per loss beyond grace (3 losses = 0.8x)', () => {
    expect(
      calculatePositionSize(
        0.03,
        { consecutiveLosses: 3, consecutiveWins: 0, capitalUsd: 250 },
        LIMITS
      )
    ).toBeCloseTo(0.024, 10);
  });

  it('clamps to minPositionPct before applying the USD floor', () => {
    // 10 losses: 0.03 * 0.8^8 ≈ 0.005 → clamped to 0.01 → $2.50 < $5 floor → 0
    expect(
      calculatePositionSize(
        0.03,
        { consecutiveLosses: 10, consecutiveWins: 0, capitalUsd: 250 },
        LIMITS
      )
    ).toBe(0);
  });

  it('returns 0 when sized notional is below the USD floor', () => {
    // 0.01 * $250 = $2.50 < $5
    expect(
      calculatePositionSize(
        0.01,
        { consecutiveLosses: 0, consecutiveWins: 0, capitalUsd: 250 },
        LIMITS
      )
    ).toBe(0);
  });

  it('boosts during win streaks within the cap', () => {
    // 5 wins: 1 + min(5-3,5)*0.1 = 1.2x → 0.03*1.2 = 0.036
    expect(
      calculatePositionSize(
        0.03,
        { consecutiveLosses: 0, consecutiveWins: 5, capitalUsd: 250 },
        LIMITS
      )
    ).toBeCloseTo(0.036, 10);
  });

  it('passes base through when dynamic sizing is disabled', () => {
    expect(
      calculatePositionSize(
        0.03,
        { consecutiveLosses: 9, consecutiveWins: 0, capitalUsd: 250 },
        { ...LIMITS, enableDynamicSizing: false }
      )
    ).toBe(0.03);
  });
});

describe('shouldPauseForLossStreak', () => {
  it('pauses at the limit and stays paused beyond it', () => {
    expect(shouldPauseForLossStreak(6, 6)).toBe(true);
    expect(shouldPauseForLossStreak(9, 6)).toBe(true);
    expect(shouldPauseForLossStreak(5, 6)).toBe(false);
  });
});

describe('evaluateWalletQuality', () => {
  const TH = {
    minWinRate: 0.6,
    minPnl: 500,
    minTrades: 30,
    minProfitFactor: 1.5,
    minConsistencyScore: 0.7,
    maxSingleTradeExposure: 0.3,
  };

  it('passes a quality wallet', () => {
    const { pass, failures } = evaluateWalletQuality(
      {
        winRate: 0.7,
        pnl: 1000,
        tradeCount: 40,
        profitFactor: 2,
        consistencyScore: 0.8,
        singleTradeExposure: 0.2,
      },
      TH
    );
    expect(pass).toBe(true);
    expect(failures).toEqual([]);
  });

  it('rejects a weak wallet with reasons', () => {
    const { pass, failures } = evaluateWalletQuality(
      {
        winRate: 0.4,
        pnl: 100,
        tradeCount: 5,
        profitFactor: 0.8,
        consistencyScore: 0.3,
        singleTradeExposure: 0.9,
      },
      TH
    );
    expect(pass).toBe(false);
    expect(failures.length).toBe(6);
  });
});

describe('computeWalletQualityFromPositions', () => {
  it('computes metrics matching the legacy bot-config math', () => {
    const positions = [
      { cashPnl: 100 },
      { cashPnl: 50 },
      { cashPnl: -20 },
      { cashPnl: -10 },
    ];
    const q = computeWalletQualityFromPositions(positions, 10);
    expect(q.tradeCount).toBe(4);
    expect(q.totalPnl).toBe(120);
    expect(q.winRate).toBe(0.5);
    expect(q.profitFactor).toBeCloseTo(150 / 30, 10);
    expect(q.consistencyScore).toBe(0.5);
    expect(q.singleTradeExposure).toBeCloseTo(100 / 180, 10);
  });

  it('handles empty history without NaN', () => {
    const q = computeWalletQualityFromPositions([], 10);
    expect(q.winRate).toBe(0);
    expect(q.profitFactor).toBe(0);
    expect(q.consistencyScore).toBe(0);
    expect(q.singleTradeExposure).toBe(0);
  });

  it('assigns 999 profit factor when all trades win', () => {
    const q = computeWalletQualityFromPositions([{ cashPnl: 10 }], 10);
    expect(q.profitFactor).toBe(999);
  });
});

describe('checkExposure', () => {
  it('allows exposure under the cap', () => {
    expect(checkExposure(50, 250, 0.3)).toEqual({
      allowed: true,
      usagePct: 0.2,
    });
  });

  it('blocks exposure over the cap', () => {
    const r = checkExposure(100, 250, 0.3);
    expect(r.allowed).toBe(false);
    expect(r.usagePct).toBeCloseTo(0.4, 10);
  });
});

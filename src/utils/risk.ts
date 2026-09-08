/**
 * Risk Utilities for position sizing, exposure caps, and wallet quality gates.
 *
 * Pure functions (no I/O, no logging) shared by `bot-config.ts` so the risk
 * math is unit-testable. Addresses PROBLEMS.md P6 (shared wallet gate),
 * P7 (exposure caps), and P13 (sizing floor + loss-streak pause).
 */

export interface PositionSizingSnapshot {
  consecutiveLosses: number;
  consecutiveWins: number;
  capitalUsd: number;
}

export interface PositionSizingLimits {
  enableDynamicSizing: boolean;
  minPositionPct: number;
  maxPositionPct: number;
  /** Fractional reduction per loss beyond the grace count (e.g. 0.20 = -20%). */
  lossSizingReduction: number;
  /** Fractional increase per win beyond the grace count (e.g. 0.10 = +10%). */
  winSizingIncrease: number;
  /** Losses before decay kicks in (default: 2). */
  lossGraceCount?: number;
  /** Wins before boost kicks in (default: 3). */
  winGraceCount?: number;
  /** Max win-boost steps (default: 5). */
  maxWinBoostSteps?: number;
  /** Minimum notional in USD; sized value below this returns 0 = skip trade. */
  minOrderUsd?: number;
}

/**
 * Dynamic position size as a fraction of capital.
 *
 * Returns 0 when the sized notional falls below `minOrderUsd` — the caller
 * must skip the trade (prevents dust orders during loss streaks).
 */
export function calculatePositionSize(
  basePct: number,
  snapshot: PositionSizingSnapshot,
  limits: PositionSizingLimits
): number {
  if (!limits.enableDynamicSizing) return basePct;

  let size = basePct;

  const lossGrace = limits.lossGraceCount ?? 2;
  if (snapshot.consecutiveLosses > lossGrace) {
    size *= Math.pow(
      1 - limits.lossSizingReduction,
      snapshot.consecutiveLosses - lossGrace
    );
  }

  const winGrace = limits.winGraceCount ?? 3;
  if (snapshot.consecutiveWins > winGrace) {
    const steps = Math.min(
      snapshot.consecutiveWins - winGrace,
      limits.maxWinBoostSteps ?? 5
    );
    size *= 1 + steps * limits.winSizingIncrease;
  }

  size = Math.max(limits.minPositionPct, size);
  size = Math.min(limits.maxPositionPct, size);

  const floor = limits.minOrderUsd ?? 0;
  if (floor > 0 && size * snapshot.capitalUsd < floor) {
    return 0;
  }

  return size;
}

/**
 * Loss-streak circuit breaker: pause new trading once consecutive losses
 * reach the configured maximum (PROBLEMS.md P13).
 */
export function shouldPauseForLossStreak(
  consecutiveLosses: number,
  maxConsecutiveLosses: number
): boolean {
  if (!Number.isFinite(consecutiveLosses) || !Number.isFinite(maxConsecutiveLosses)) {
    return false;
  }
  return maxConsecutiveLosses > 0 && consecutiveLosses >= maxConsecutiveLosses;
}

export interface WalletQualityGate {
  winRate: number;
  pnl: number;
  tradeCount: number;
  profitFactor: number;
  consistencyScore: number;
  singleTradeExposure: number;
}

export interface WalletQualityThresholds {
  minWinRate: number;
  minPnl: number;
  minTrades: number;
  minProfitFactor: number;
  minConsistencyScore: number;
  maxSingleTradeExposure: number;
}

/**
 * Single shared quality gate for smart-money candidates. MUST be applied to
 * both leaderboard wallets and user-supplied custom wallets (PROBLEMS.md P6).
 */
export function evaluateWalletQuality(
  wallet: WalletQualityGate,
  t: WalletQualityThresholds
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (wallet.tradeCount < t.minTrades) {
    failures.push(`Trades:${wallet.tradeCount}<${t.minTrades}`);
  }
  if (wallet.winRate < t.minWinRate) {
    failures.push(
      `WR:${(wallet.winRate * 100).toFixed(0)}%<${(t.minWinRate * 100).toFixed(0)}%`
    );
  }
  if (wallet.pnl < t.minPnl) {
    failures.push(`PnL:$${wallet.pnl}<$${t.minPnl}`);
  }
  if (wallet.profitFactor < t.minProfitFactor) {
    failures.push(`PF:${wallet.profitFactor.toFixed(2)}<${t.minProfitFactor}`);
  }
  if (wallet.consistencyScore < t.minConsistencyScore) {
    failures.push(
      `Cons:${(wallet.consistencyScore * 100).toFixed(0)}%<${(t.minConsistencyScore * 100).toFixed(0)}%`
    );
  }
  if (wallet.singleTradeExposure > t.maxSingleTradeExposure) {
    failures.push(
      `Whale:${(wallet.singleTradeExposure * 100).toFixed(0)}%>${(t.maxSingleTradeExposure * 100).toFixed(0)}%`
    );
  }
  return { pass: failures.length === 0, failures };
}

export interface PnlPosition {
  cashPnl?: number | null;
}

export interface ComputedWalletQuality {
  tradeCount: number;
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  consistencyScore: number;
  singleTradeExposure: number;
}

/**
 * Derive quality metrics from a position list. Mirrors the math previously
 * inline in `bot-config.ts` so custom and leaderboard wallets share it.
 */
export function computeWalletQualityFromPositions(
  positions: PnlPosition[],
  checkLastN: number
): ComputedWalletQuality {
  const pnls = positions.map(p => p.cashPnl ?? 0);
  const wins = pnls.filter(v => v > 0);
  const losses = pnls.filter(v => v < 0);
  const totalWins = wins.reduce((s, v) => s + Math.abs(v), 0);
  const totalLosses = losses.reduce((s, v) => s + Math.abs(v), 0);

  const absSorted = pnls.map(Math.abs).sort((a, b) => b - a);
  const biggest = absSorted[0] ?? 0;
  const totalAbs = absSorted.reduce((s, v) => s + v, 0);

  const lastN = pnls.slice(0, checkLastN);
  const recentWins = lastN.filter(v => v > 0).length;

  return {
    tradeCount: positions.length,
    totalPnl: pnls.reduce((s, v) => s + v, 0),
    winRate: positions.length > 0 ? wins.length / positions.length : 0,
    profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0,
    consistencyScore: lastN.length > 0 ? recentWins / lastN.length : 0,
    singleTradeExposure: totalAbs > 0 ? biggest / totalAbs : 0,
  };
}

/**
 * Total-exposure cap check (PROBLEMS.md P7).
 */
export function checkExposure(
  exposureUsd: number,
  capitalUsd: number,
  maxTotalExposurePct: number
): { allowed: boolean; usagePct: number } {
  if (!(capitalUsd > 0) || !Number.isFinite(exposureUsd)) {
    return { allowed: false, usagePct: 0 };
  }
  const usagePct = exposureUsd / capitalUsd;
  return { allowed: usagePct <= maxTotalExposurePct, usagePct };
}

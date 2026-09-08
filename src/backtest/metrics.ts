/**
 * Backtest Metrics — win rate, profit factor, max drawdown over an equity curve.
 */

import type { BacktestMetrics, BacktestTrade } from './types.js';

export function summarizeTrades(
  trades: BacktestTrade[],
  startingEquity: number
): BacktestMetrics {
  const equity: number[] = [startingEquity];
  let wins = 0;
  let losses = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let peak = startingEquity;
  let maxDrawdown = 0;

  for (const t of trades) {
    const next = equity[equity.length - 1] + t.pnl;
    equity.push(next);
    if (t.pnl > 0) {
      wins++;
      grossWin += t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      grossLoss += Math.abs(t.pnl);
    }
    if (next > peak) peak = next;
    const dd = peak > 0 ? (peak - next) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const totalPnl = equity[equity.length - 1] - startingEquity;
  return {
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length > 0 ? wins / trades.length : 0,
    totalPnl,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0,
    maxDrawdown,
    equity,
  };
}

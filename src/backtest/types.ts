/**
 * Backtest Types (PROBLEMS.md P11)
 *
 * Minimal replay harness: strategies consume historical orderbook snapshots
 * (JSONL, one object per line) and emit intended trades; the replay engine
 * fills them with a simple taker model (fill at touch + fee + gas) and
 * tracks the equity curve.
 *
 * JSONL snapshot schema:
 * ```json
 * {"ts": 1710000000000, "yesAsk": 0.45, "yesBid": 0.44, "noAsk": 0.45,
 *  "noBid": 0.44, "yesAskSize": 100, "noAskSize": 100,
 *  "yesBidSize": 100, "noBidSize": 100}
 * ```
 */

import type { PriceLevel } from '../utils/price-utils.js';

export interface BacktestSnapshot {
  ts: number;
  yesAsk: number;
  yesBid: number;
  noAsk: number;
  noBid: number;
  yesAskSize?: number;
  noAskSize?: number;
  yesBidSize?: number;
  noBidSize?: number;
  /**
   * Multi-level depth (best-first, capped at export time).
   * Present when snapshots come from Pendulum `book` rows; the replay
   * engine walks these ladders for VWAP fills instead of assuming all
   * size is available at the touch.
   */
  levels?: {
    yesAsks: PriceLevel[];
    yesBids: PriceLevel[];
    noAsks: PriceLevel[];
    noBids: PriceLevel[];
  };
}

export type BacktestSignalType = 'long' | 'short' | 'flat';

export interface BacktestSignal {
  type: BacktestSignalType;
  /** Desired pair size (clamped by the engine to depth + maxTradeSize). */
  size: number;
}

export interface BacktestTrade {
  ts: number;
  type: 'long' | 'short';
  size: number;
  entryCost: number;
  exitValue: number;
  feeUsd: number;
  gasUsd: number;
  pnl: number;
}

export interface BacktestMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  maxDrawdown: number;
  equity: number[];
}

export interface BacktestConfig {
  /** Starting equity in USD. */
  startingEquity?: number;
  /** Taker fee in basis points applied per fill leg. */
  feeRateBps?: number;
  /** Gas cost in USD charged per round-trip trade. */
  gasCostUsd?: number;
  /** Maximum pair size per trade. */
  maxTradeSize?: number;
  /** Minimum net PnL in USD required to take a signal. */
  minNetProfitUsd?: number;
}

/**
 * Strategy function: inspect a snapshot, return a signal (or flat).
 */
export type BacktestStrategy = (
  snapshot: BacktestSnapshot,
  index: number
) => BacktestSignal;

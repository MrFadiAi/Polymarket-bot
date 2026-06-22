/**
 * LeaderboardProvider — pluggable source of "smart-money" traders.
 *
 * The default smart-money path reads Polymarket's free `/v1/leaderboard`, which only
 * returns pnl / volume / tradeCount. It does NOT return win-rate or profit-factor, so the
 * README's advertised "60%+ win rate, 1.5x profit factor" filter can't be enforced at
 * selection time without an expensive per-wallet closed-position crawl.
 *
 * This interface lets an OPTIONAL enriched provider (e.g. Monid) supply those metrics
 * inline, so `minWinRate` / `minProfitFactor` become real filters. The free path stays
 * the default — nothing here changes existing behavior unless a provider is injected.
 *
 * Dependency-free so it can be reviewed in isolation.
 */
import type { TimePeriod } from './wallet-service.js';

/** Normalized smart-money row. Optional fields are only set by providers that have them. */
export interface SmartMoneyLeaderboardRow {
  address: string;
  rank: number;
  /** total PnL in USD. */
  pnl: number;
  volume?: number;
  tradeCount?: number;
  roi?: number;
  /** 0..1 */
  winRate?: number;
  profitFactor?: number;
  name?: string;
  tradingStyles?: {
    isWhale?: boolean;
    isDegen?: boolean;
    isHighConviction?: boolean;
    isMarketMaker?: boolean;
    isContrarian?: boolean;
  };
}

export interface LeaderboardQuery {
  period?: TimePeriod;
  limit?: number;
  /** minimum total PnL (existing behavior). */
  minPnl?: number;
  /** NEW: minimum win rate 0..1 — only enforced by providers that supply winRate. */
  minWinRate?: number;
  /** NEW: minimum profit factor — only enforced by providers that supply profitFactor. */
  minProfitFactor?: number;
}

export interface LeaderboardProvider {
  /** stable id, e.g. 'monid'. */
  readonly name: string;
  /** Returns rows sorted by PnL desc and filtered by the query. */
  fetchLeaderboard(query: LeaderboardQuery): Promise<SmartMoneyLeaderboardRow[]>;
}

/** Apply the metric gates a provider can honor given the fields it actually supplied. */
export function applyMetricFilters(
  rows: SmartMoneyLeaderboardRow[],
  q: LeaderboardQuery
): SmartMoneyLeaderboardRow[] {
  return rows.filter((r) => {
    if (q.minPnl != null && r.pnl < q.minPnl) return false;
    // Only gate on metrics the provider actually returned, otherwise pass through.
    if (q.minWinRate != null && r.winRate != null && r.winRate < q.minWinRate) return false;
    if (q.minProfitFactor != null && r.profitFactor != null && r.profitFactor < q.minProfitFactor) {
      return false;
    }
    return true;
  });
}

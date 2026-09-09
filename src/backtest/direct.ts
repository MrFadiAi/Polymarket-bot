/**
 * Direct Trading holder backtest — simulates the exit logic whose parameters
 * live in `bot-config.ts` `directTrading` but are never enforced live
 * (stopLossPct 0.15 / takeProfitPct 0.25 / trailingStopPct 0.10 /
 * maxHoldDays 7; the live path only logs signals and places a fixed $5
 * market buy).
 *
 * Model: sequential round-trips on one side. Enter with a taker FOK-buy of
 * `notionalUsd` at the ask ladder (VWAP via `fillLadder`; partial fills
 * abort, like the live FOK orders). While open, mark against the top bid
 * and exit on the first trigger per snapshot, checked in this order:
 * take-profit → stop-loss → trailing stop → max-hold expiry. Exits sell
 * the full size into the bid ladder; any unfilled remainder (thin bids) is
 * worthless — the same conservative convention as the DipArb backtest.
 *
 * One open position at a time; a new round opens on the next snapshot after
 * an exit. This measures what buy-and-hold-with-exits would have done on
 * the market — entry timing is intentionally naive because the live bot has
 * no real entry signal either.
 */

import { fillLadder } from './replay.js';
import { summarizeTrades } from './metrics.js';
import type { BacktestMetrics, BacktestSnapshot, BacktestTrade } from './types.js';
import type { PriceLevel } from '../utils/price-utils.js';

/** Defaults mirror `bot-config.ts` `directTrading` + the live $5 buy. */
export const DEFAULT_DIRECT = {
  stopLossPct: 0.15,
  takeProfitPct: 0.25,
  trailingStopPct: 0.1,
  maxHoldDays: 7,
  notionalUsd: 5,
} as const;

export interface DirectConfig {
  side?: 'yes' | 'no';
  notionalUsd?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  maxHoldDays?: number;
  feeRateBps?: number;
  gasPerRoundUsd?: number;
}

export type DirectExit = 'take-profit' | 'stopped' | 'trailing' | 'expired';

export interface DirectRound {
  side: 'yes' | 'no';
  entryTs: number;
  entryPrice: number;
  shares: number;
  exit: DirectExit;
  exitTs: number;
  exitPrice: number;
  pnl: number;
}

export interface DirectReport {
  rounds: DirectRound[];
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
}

function touchLadder(price: number, size?: number): PriceLevel[] {
  if (!(price > 0)) return [];
  return [{ price, size: size ?? Number.POSITIVE_INFINITY }];
}

export function runDirectBacktest(
  snapshots: BacktestSnapshot[],
  config: DirectConfig = {}
): DirectReport {
  const side = config.side ?? 'yes';
  const notionalUsd = config.notionalUsd ?? DEFAULT_DIRECT.notionalUsd;
  const stopLossPct = config.stopLossPct ?? DEFAULT_DIRECT.stopLossPct;
  const takeProfitPct = config.takeProfitPct ?? DEFAULT_DIRECT.takeProfitPct;
  const trailingStopPct = config.trailingStopPct ?? DEFAULT_DIRECT.trailingStopPct;
  const maxHoldMs = (config.maxHoldDays ?? DEFAULT_DIRECT.maxHoldDays) * 86_400_000;
  const feeRateBps = config.feeRateBps ?? 0;
  const gas = config.gasPerRoundUsd ?? 0;

  const snaps = [...snapshots].sort((a, b) => a.ts - b.ts);
  const askLadder = (s: BacktestSnapshot): PriceLevel[] =>
    side === 'yes'
      ? (s.levels?.yesAsks ?? touchLadder(s.yesAsk, s.yesAskSize))
      : (s.levels?.noAsks ?? touchLadder(s.noAsk, s.noAskSize));
  const bidLadder = (s: BacktestSnapshot): PriceLevel[] =>
    side === 'yes'
      ? (s.levels?.yesBids ?? touchLadder(s.yesBid, s.yesBidSize))
      : (s.levels?.noBids ?? touchLadder(s.noBid, s.noBidSize));

  const rounds: DirectRound[] = [];
  let open: { entryTs: number; entryPrice: number; shares: number; cost: number; peak: number } | null = null;

  const closeAs = (snap: BacktestSnapshot, exit: DirectExit): void => {
    if (!open) return;
    const sale = fillLadder(bidLadder(snap), open.shares);
    const exitPrice = sale.filled > 0 ? sale.notional / sale.filled : 0;
    rounds.push({
      side,
      entryTs: open.entryTs,
      entryPrice: open.entryPrice,
      shares: open.shares,
      exit,
      exitTs: snap.ts,
      exitPrice,
      pnl: sale.notional - open.cost - gas,
    });
    open = null;
  };

  for (const snap of snaps) {
    if (open) {
      const bids = bidLadder(snap);
      const topBid = bids.length > 0 ? bids[0].price : 0;
      if (!(topBid > 0)) continue;
      if (topBid > open.peak) open.peak = topBid;
      if (topBid >= open.entryPrice * (1 + takeProfitPct)) closeAs(snap, 'take-profit');
      else if (topBid <= open.entryPrice * (1 - stopLossPct)) closeAs(snap, 'stopped');
      else if (topBid <= open.peak * (1 - trailingStopPct)) closeAs(snap, 'trailing');
      else if (snap.ts - open.entryTs > maxHoldMs) closeAs(snap, 'expired');
    } else {
      if (!(notionalUsd > 0)) continue;
      const asks = askLadder(snap);
      const topAsk = asks.length > 0 ? asks[0].price : 0;
      if (!(topAsk > 0)) continue;
      const shares = notionalUsd / topAsk;
      const leg = fillLadder(asks, shares);
      // FOK: partial fills abort.
      if (leg.filled !== shares) continue;
      const cost = leg.notional * (1 + feeRateBps / 10_000);
      open = { entryTs: snap.ts, entryPrice: leg.notional / shares, shares, cost, peak: 0 };
    }
  }

  if (open && snaps.length > 0) closeAs(snaps[snaps.length - 1], 'expired');

  const trades: BacktestTrade[] = rounds.map((r) => ({
    ts: r.exitTs,
    type: 'long' as const,
    size: r.shares,
    entryCost: r.entryPrice * r.shares,
    exitValue: r.entryPrice * r.shares + r.pnl,
    feeUsd: 0,
    gasUsd: 0,
    pnl: r.pnl,
  }));

  return { rounds, trades, metrics: summarizeTrades(trades, 0) };
}

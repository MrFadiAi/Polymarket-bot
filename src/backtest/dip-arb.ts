/**
 * DipArb backtest — mirrors the live machine in
 * `src/services/dip-arb-service.ts`:
 *
 * Leg1 dip trigger (side's best-ask drops >= dipThreshold vs
 * slidingWindowMs ago, inside windowMinutes of round start) → Leg1 FOK-buy
 * `shares` at the ask ladder → Leg2 1:1 hedge once
 * `leg1price + hedgeAsk <= sumTarget`, else leg2TimeoutSeconds / stopLossPct
 * emergency-exits Leg1 at the bid ladder. Completed pairs settle at $1
 * (the live `merge()` assumption).
 *
 * UP maps to `yes`, DOWN to `no`. Surge and mispricing patterns are
 * skipped: surge is disabled in the live script, mispricing needs an
 * oracle feed absent from snapshots.
 *
 * One open position at a time (live `isExecuting` guard).
 */

import { fillLadder, parseSnapshotsJsonl } from './replay.js';
import { summarizeTrades } from './metrics.js';
import type { BacktestMetrics, BacktestSnapshot, BacktestTrade } from './types.js';
import type { PriceLevel } from '../utils/price-utils.js';

export interface DipArbConfig {
  dipThreshold?: number;
  slidingWindowMs?: number;
  windowMinutes?: number;
  sumTarget?: number;
  leg2TimeoutSeconds?: number;
  stopLossPct?: number;
  shares?: number;
  /** Live MIN_TRADE_VALUE ($1.50): Leg1 notional below this is rejected. */
  minTradeValueUsd?: number;
  feeRateBps?: number;
  gasPerRoundUsd?: number;
}

export type DipArbSide = 'yes' | 'no';

export interface DipArbRound {
  side: DipArbSide;
  leg1Ts: number;
  leg1Price: number;
  leg1Shares: number;
  status: 'completed' | 'expired' | 'stopped';
  leg2Ts?: number;
  leg2Price?: number;
  exitTs?: number;
  exitPrice?: number;
  pnl: number;
}

export interface DipArbReport {
  signals: number;
  rounds: DipArbRound[];
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
}

interface AskTick {
  ts: number;
  ask: number;
}

function touchLadder(price: number, size?: number): PriceLevel[] {
  if (!(price > 0)) return [];
  return [{ price, size: size ?? Number.POSITIVE_INFINITY }];
}

function withFee(notional: number, feeRateBps: number): number {
  return notional * (1 + feeRateBps / 10_000);
}

export function runDipArbBacktest(
  snapshots: BacktestSnapshot[],
  config: DipArbConfig = {}
): DipArbReport {
  const dipThreshold = config.dipThreshold ?? 0.15;
  const slidingWindowMs = config.slidingWindowMs ?? 3000;
  const windowMs = (config.windowMinutes ?? 2) * 60_000;
  const sumTarget = config.sumTarget ?? 0.92;
  const timeoutMs = (config.leg2TimeoutSeconds ?? 60) * 1000;
  const stopLossPct = config.stopLossPct ?? 0.2;
  const shares = config.shares ?? 20;
  const minValue = config.minTradeValueUsd ?? 1.5;
  const feeRateBps = config.feeRateBps ?? 0;
  const gas = config.gasPerRoundUsd ?? 0;

  const snaps = [...snapshots].sort((a, b) => a.ts - b.ts);
  const t0 = snaps.length > 0 ? snaps[0].ts : 0;
  const askHist: Record<DipArbSide, AskTick[]> = { yes: [], no: [] };

  let signals = 0;
  const rounds: DipArbRound[] = [];
  let open: { side: DipArbSide; leg1Ts: number; leg1Price: number; leg1Notional: number } | null = null;

  const askOf = (s: BacktestSnapshot, side: DipArbSide): number =>
    side === 'yes' ? s.yesAsk : s.noAsk;
  const askLadder = (s: BacktestSnapshot, side: DipArbSide): PriceLevel[] =>
    side === 'yes'
      ? (s.levels?.yesAsks ?? touchLadder(s.yesAsk, s.yesAskSize))
      : (s.levels?.noAsks ?? touchLadder(s.noAsk, s.noAskSize));
  const bidLadder = (s: BacktestSnapshot, side: DipArbSide): PriceLevel[] =>
    side === 'yes'
      ? (s.levels?.yesBids ?? touchLadder(s.yesBid, s.yesBidSize))
      : (s.levels?.noBids ?? touchLadder(s.noBid, s.noBidSize));

  const askAgo = (side: DipArbSide, now: number): number => {
    const hist = askHist[side];
    let ref = 0;
    for (const t of hist) {
      if (t.ts <= now - slidingWindowMs) ref = t.ask;
      else break;
    }
    return ref;
  };

  const closeAsExit = (
    snap: BacktestSnapshot,
    status: 'expired' | 'stopped'
  ): void => {
    if (!open) return;
    const exit = fillLadder(bidLadder(snap, open.side), shares);
    // Conservative: unfilled remainder (thin bids) is worthless.
    const proceeds = exit.notional;
    const pnl = proceeds - open.leg1Notional - gas;
    rounds.push({
      side: open.side,
      leg1Ts: open.leg1Ts,
      leg1Price: open.leg1Price,
      leg1Shares: shares,
      status,
      exitTs: snap.ts,
      exitPrice: exit.filled > 0 ? exit.notional / exit.filled : 0,
      pnl,
    });
    open = null;
  };

  for (const snap of snaps) {
    // Live keeps recording price history during execution (only detection
    // is gated by isExecuting) — same here.
    askHist.yes.push({ ts: snap.ts, ask: askOf(snap, 'yes') });
    askHist.no.push({ ts: snap.ts, ask: askOf(snap, 'no') });
    if (open) {
      const hedgeSide: DipArbSide = open.side === 'yes' ? 'no' : 'yes';
      const hedge = fillLadder(askLadder(snap, hedgeSide), shares);
      // Hedge first when both fill and exit trigger on one snapshot.
      if (hedge.filled === shares) {
        const hedgePrice = hedge.notional / shares;
        const totalCost = open.leg1Price + hedgePrice + ((open.leg1Notional + hedge.notional) * feeRateBps) / 10_000 / shares;
        if (totalCost <= sumTarget) {
          const leg1Fee = (open.leg1Notional * feeRateBps) / 10_000;
          const hedgeFee = (hedge.notional * feeRateBps) / 10_000;
          rounds.push({
            side: open.side,
            leg1Ts: open.leg1Ts,
            leg1Price: open.leg1Price,
            leg1Shares: shares,
            status: 'completed',
            leg2Ts: snap.ts,
            leg2Price: hedgePrice,
            pnl: shares * 1 - open.leg1Notional - hedge.notional - leg1Fee - hedgeFee - gas,
          });
          open = null;
          continue;
        }
      }
      const bids = bidLadder(snap, open.side);
      const topBid = bids.length > 0 ? bids[0].price : 0;
      const stopHit =
        open.leg1Price > 0 && topBid > 0 && (open.leg1Price - topBid) / open.leg1Price >= stopLossPct;
      if (stopHit) {
        closeAsExit(snap, 'stopped');
        continue;
      }
      if (snap.ts - open.leg1Ts > timeoutMs) {
        closeAsExit(snap, 'expired');
        continue;
      }
    } else {
      if (snap.ts - t0 > windowMs) continue;
      for (const side of ['yes', 'no'] as DipArbSide[]) {
        const now = askOf(snap, side);
        const ago = askAgo(side, snap.ts);
        if (!(ago > 0) || !(now > 0)) continue;
        if ((ago - now) / ago >= dipThreshold) {
          signals++;
          const leg1 = fillLadder(askLadder(snap, side), shares);
          // FOK: partial fills abort, exactly like the live order.
          if (leg1.filled !== shares) break;
          const leg1Notional = withFee(leg1.notional, feeRateBps);
          if (leg1Notional < minValue) break;
          open = { side, leg1Ts: snap.ts, leg1Price: leg1.notional / shares, leg1Notional };
          break;
        }
      }
    }
  }

  if (open && snaps.length > 0) closeAsExit(snaps[snaps.length - 1], 'expired');

  const trades: BacktestTrade[] = rounds.map((r) =>
    r.status === 'completed'
      ? {
          ts: r.leg2Ts ?? r.leg1Ts,
          type: 'long' as const,
          size: r.leg1Shares,
          entryCost: r.leg1Price * r.leg1Shares + (r.leg2Price ?? 0) * r.leg1Shares,
          exitValue: r.leg1Shares * 1,
          feeUsd: 0,
          gasUsd: 0,
          pnl: r.pnl,
        }
      : {
          ts: r.exitTs ?? r.leg1Ts,
          type: 'long' as const,
          size: r.leg1Shares,
          entryCost: r.leg1Price * r.leg1Shares,
          exitValue: r.leg1Price * r.leg1Shares + r.pnl,
          feeUsd: 0,
          gasUsd: 0,
          pnl: r.pnl,
        }
  );

  return { signals, rounds, trades, metrics: summarizeTrades(trades, 0) };
}

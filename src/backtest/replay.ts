/**
 * Backtest Replay Engine (PROBLEMS.md P11)
 *
 * Replays orderbook snapshots through a strategy. Fills use a simple taker
 * model: long buys YES+NO at the touch, merges to $1; short sells the pair
 * at the touch. Every leg pays `feeRateBps` on notional, every round-trip
 * pays `gasCostUsd`. Signals whose fee-and-gas-adjusted net is below
 * `minNetProfitUsd` are skipped — mirroring the live `ArbitrageService`
 * net-profit gate.
 */

import { getEffectivePrices, estimateTakerFee } from '../utils/price-utils.js';
import type { PriceLevel } from '../utils/price-utils.js';
import { summarizeTrades } from './metrics.js';
import type {
  BacktestConfig,
  BacktestMetrics,
  BacktestSnapshot,
  BacktestStrategy,
  BacktestTrade,
} from './types.js';

export interface BacktestResult {
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
}

/**
 * Fee-aware long-arb strategy mirroring live detection: buy YES+NO, merge $1.
 */
export function longArbStrategy(
  snapshot: BacktestSnapshot,
  _index: number,
  opts: { profitThreshold?: number } = {}
): { type: 'long' | 'flat'; size: number } {
  const e = getEffectivePrices(
    snapshot.yesAsk,
    snapshot.yesBid,
    snapshot.noAsk,
    snapshot.noBid
  );
  const cost = e.effectiveBuyYes + e.effectiveBuyNo;
  const profit = 1 - cost;
  if (profit > (opts.profitThreshold ?? 0)) {
    return { type: 'long', size: Number.POSITIVE_INFINITY };
  }
  return { type: 'flat', size: 0 };
}

/**
 * Walk a best-first ladder, filling up to `size`.
 * Returns filled size and total notional (VWAP = notional / filled).
 */
export function fillLadder(
  levels: PriceLevel[],
  size: number
): { filled: number; notional: number } {
  let filled = 0;
  let notional = 0;
  for (const l of levels) {
    if (filled >= size) break;
    if (!Number.isFinite(l.price) || !Number.isFinite(l.size) || l.size <= 0) continue;
    const take = Math.min(l.size, size - filled);
    filled += take;
    notional += take * l.price;
  }
  return { filled, notional };
}

/** Total executable size resting on a ladder. */
export function ladderSize(levels: PriceLevel[]): number {
  return levels.reduce((s, l) => s + (Number.isFinite(l.size) && l.size > 0 ? l.size : 0), 0);
}

export function runBacktest(
  snapshots: BacktestSnapshot[],
  strategy: BacktestStrategy,
  config: BacktestConfig = {}
): BacktestResult {
  const startingEquity = config.startingEquity ?? 250;
  const feeRateBps = config.feeRateBps ?? 0;
  const gasCostUsd = config.gasCostUsd ?? 0;
  const maxTradeSize = config.maxTradeSize ?? 100;
  const minNetProfitUsd = config.minNetProfitUsd ?? 0;

  const trades: BacktestTrade[] = [];

  snapshots.forEach((snap, i) => {
    const signal = strategy(snap, i);
    if (signal.type === 'flat' || signal.size <= 0) return;

    const e = getEffectivePrices(snap.yesAsk, snap.yesBid, snap.noAsk, snap.noBid);

    if (signal.type === 'long') {
      // Depth-aware fill: when multi-level ladders are present (Pendulum
      // `book` rows), walk both ask ladders at VWAP. This is conservative:
      // it uses the direct ladders, ignoring the mirror (1 - bid) route the
      // edge detection considers. Partial fills allowed — size clamps to
      // what rests on BOTH ladders.
      const askLevels = snap.levels ? [snap.levels.yesAsks, snap.levels.noAsks] : undefined;
      if (askLevels && (ladderSize(askLevels[0]) > 0 || ladderSize(askLevels[1]) > 0)) {
        const size = Math.max(
          0,
          Math.min(signal.size, ladderSize(askLevels[0]), ladderSize(askLevels[1]), maxTradeSize)
        );
        if (size <= 0) return;
        // size is clamped to valid ladder depth, so both legs fill fully.
        const legYes = fillLadder(askLevels[0], size);
        const legNo = fillLadder(askLevels[1], size);
        const entryCost = legYes.notional + legNo.notional;
        const feeUsd =
          estimateTakerFee(legYes.notional, feeRateBps) +
          estimateTakerFee(legNo.notional, feeRateBps);
        const pnl = size - entryCost - feeUsd - gasCostUsd;
        if (pnl < minNetProfitUsd) return;
        trades.push({
          ts: snap.ts,
          type: 'long',
          size,
          entryCost,
          exitValue: size,
          feeUsd,
          gasUsd: gasCostUsd,
          pnl,
        });
        return;
      }
      const depth = Math.min(snap.yesAskSize ?? maxTradeSize, snap.noAskSize ?? maxTradeSize);
      const size = Math.max(0, Math.min(signal.size, depth, maxTradeSize));
      if (size <= 0) return;
      const entryCost = (e.effectiveBuyYes + e.effectiveBuyNo) * size;
      const feeUsd =
        estimateTakerFee(e.effectiveBuyYes * size, feeRateBps) +
        estimateTakerFee(e.effectiveBuyNo * size, feeRateBps);
      const pnl = size - entryCost - feeUsd - gasCostUsd;
      if (pnl < minNetProfitUsd) return;
      trades.push({
        ts: snap.ts,
        type: 'long',
        size,
        entryCost,
        exitValue: size,
        feeUsd,
        gasUsd: gasCostUsd,
        pnl,
      });
    } else {
      const depth = Math.min(snap.yesBidSize ?? maxTradeSize, snap.noBidSize ?? maxTradeSize);
      const size = Math.max(0, Math.min(signal.size, depth, maxTradeSize));
      if (size <= 0) return;
      const exitValue = (e.effectiveSellYes + e.effectiveSellNo) * size;
      const feeUsd =
        estimateTakerFee(e.effectiveSellYes * size, feeRateBps) +
        estimateTakerFee(e.effectiveSellNo * size, feeRateBps);
      const pnl = exitValue - size - feeUsd - gasCostUsd;
      if (pnl < minNetProfitUsd) return;
      trades.push({
        ts: snap.ts,
        type: 'short',
        size,
        entryCost: size,
        exitValue,
        feeUsd,
        gasUsd: gasCostUsd,
        pnl,
      });
    }
  });

  return { trades, metrics: summarizeTrades(trades, startingEquity) };
}

/**
 * Parse a JSONL string into snapshots (skips blank lines; throws on invalid).
 */
export function parseSnapshotsJsonl(jsonl: string): BacktestSnapshot[] {
  const out: BacktestSnapshot[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as BacktestSnapshot);
  }
  return out;
}

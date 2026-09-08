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

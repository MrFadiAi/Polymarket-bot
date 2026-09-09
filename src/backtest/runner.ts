/**
 * Backtest Runner — `npm run backtest -- <snapshots.jsonl>`
 *
 * Reads orderbook snapshots (see types.ts for the JSONL schema), replays the
 * fee-aware long-arb strategy, and prints a metrics summary.
 */

import { readFileSync } from 'node:fs';
import { longArbStrategy, parseSnapshotsJsonl, runBacktest } from './replay.js';
import { scanArbAvailability, fokFillRates } from './availability.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run backtest -- <snapshots.jsonl>');
  process.exit(1);
}

const snapshots = parseSnapshotsJsonl(readFileSync(file, 'utf8'));
const profitThreshold = 0.005;
const availability = scanArbAvailability(snapshots, { profitThreshold });
const { trades, metrics } = runBacktest(
  snapshots,
  (snap, i) => longArbStrategy(snap, i, { profitThreshold }),
  {
    startingEquity: 250,
    feeRateBps: Number(process.env.BACKTEST_FEE_BPS ?? 0),
    gasCostUsd: Number(process.env.BACKTEST_GAS_USD ?? 0.1),
    maxTradeSize: Number(process.env.BACKTEST_MAX_SIZE ?? 20),
    minNetProfitUsd: Number(process.env.BACKTEST_MIN_NET ?? 0.5),
  }
);

console.log(
  JSON.stringify(
    {
      snapshots: snapshots.length,
      trades: metrics.trades,
      wins: metrics.wins,
      losses: metrics.losses,
      winRate: metrics.winRate,
      totalPnl: metrics.totalPnl,
      profitFactor: metrics.profitFactor,
      maxDrawdown: metrics.maxDrawdown,
      availability: {
        edgeSnapshots: availability.edgeSnapshots,
        edgeFraction: availability.edgeFraction,
        windows: availability.windows.length,
        medianWindowMs: availability.medianWindowMs,
        maxWindowMs: availability.maxWindowMs,
        avgEdge: availability.avgEdge,
        maxEdge: availability.maxEdge,
      },
      fokFillRates: fokFillRates(snapshots),
      sample: trades.slice(0, 5),
    },
    null,
    2
  )
);

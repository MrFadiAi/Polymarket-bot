/**
 * DipArb panic-detection replay over Pendulum `book` snapshots.
 *
 * Usage:
 *   npx tsx scripts/backtest/dip-arb.ts <snapshots.jsonl> [--dip 0.15]
 *     [--window-ms 3000] [--window-min 2] [--target 0.92] [--timeout 60]
 *     [--stoploss 0.20] [--shares 20]
 *
 * Snapshots come from scripts/backtest/pendulum-to-jsonl.ts with UP→--yes,
 * DOWN→--no. Prints a JSON report (signals, rounds, metrics).
 */

import { readFileSync } from 'node:fs';
import { runDipArbBacktest } from '../../src/backtest/dip-arb.js';
import { parseSnapshotsJsonl } from '../../src/backtest/replay.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [jsonlFile] = positional;
if (!jsonlFile) {
  console.error(
    'Usage: dip-arb.ts <snapshots.jsonl> [--dip 0.15] [--window-ms 3000] [--window-min 2] [--target 0.92] [--timeout 60] [--stoploss 0.20] [--shares 20]'
  );
  process.exit(1);
}

const num = (name: string, fallback: number): number => {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
};

const snapshots = parseSnapshotsJsonl(readFileSync(jsonlFile, 'utf8'));
const report = runDipArbBacktest(snapshots, {
  dipThreshold: num('--dip', 0.15),
  slidingWindowMs: num('--window-ms', 3000),
  windowMinutes: num('--window-min', 2),
  sumTarget: num('--target', 0.92),
  leg2TimeoutSeconds: num('--timeout', 60),
  stopLossPct: num('--stoploss', 0.2),
  shares: num('--shares', 20),
});

console.log(
  JSON.stringify(
    {
      snapshots: snapshots.length,
      signals: report.signals,
      roundCount: report.rounds.length,
      completed: report.rounds.filter((r) => r.status === 'completed').length,
      expired: report.rounds.filter((r) => r.status === 'expired').length,
      stopped: report.rounds.filter((r) => r.status === 'stopped').length,
      winRate: report.metrics.winRate,
      totalPnl: report.metrics.totalPnl,
      maxDrawdown: report.metrics.maxDrawdown,
      rounds: report.rounds,
    },
    null,
    2
  )
);

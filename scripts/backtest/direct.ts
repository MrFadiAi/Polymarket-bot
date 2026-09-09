/**
 * Direct Trading holder replay over Pendulum `book` snapshots.
 *
 * Usage:
 *   npx tsx scripts/backtest/direct.ts <snapshots.jsonl> [--side yes]
 *     [--notional 5] [--stop 0.15] [--tp 0.25] [--trail 0.10]
 *     [--max-hold-days 7]
 *
 * Simulates the exit logic parameterized in `bot-config.ts` `directTrading`
 * (never enforced live): enter with a $5 taker FOK-buy, exit on
 * take-profit / stop-loss / trailing stop / max-hold expiry. Prints a JSON
 * report (rounds, exit counts, metrics).
 */

import { readFileSync } from 'node:fs';
import { runDirectBacktest } from '../../src/backtest/direct.js';
import { parseSnapshotsJsonl } from '../../src/backtest/replay.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [jsonlFile] = positional;
if (!jsonlFile) {
  console.error(
    'Usage: direct.ts <snapshots.jsonl> [--side yes] [--notional 5] [--stop 0.15] [--tp 0.25] [--trail 0.10] [--max-hold-days 7]'
  );
  process.exit(1);
}

const num = (name: string, fallback: number): number => {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
};

const side = flag('--side') === 'no' ? ('no' as const) : ('yes' as const);
const snapshots = parseSnapshotsJsonl(readFileSync(jsonlFile, 'utf8'));
const report = runDirectBacktest(snapshots, {
  side,
  notionalUsd: num('--notional', 5),
  stopLossPct: num('--stop', 0.15),
  takeProfitPct: num('--tp', 0.25),
  trailingStopPct: num('--trail', 0.1),
  maxHoldDays: num('--max-hold-days', 7),
});

console.log(
  JSON.stringify(
    {
      snapshots: snapshots.length,
      roundCount: report.rounds.length,
      'take-profit': report.rounds.filter((r) => r.exit === 'take-profit').length,
      stopped: report.rounds.filter((r) => r.exit === 'stopped').length,
      trailing: report.rounds.filter((r) => r.exit === 'trailing').length,
      expired: report.rounds.filter((r) => r.exit === 'expired').length,
      winRate: report.metrics.winRate,
      totalPnl: report.metrics.totalPnl,
      maxDrawdown: report.metrics.maxDrawdown,
      rounds: report.rounds,
    },
    null,
    2
  )
);

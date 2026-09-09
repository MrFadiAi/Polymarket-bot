/**
 * Touch-stream arb decay report.
 *
 * Usage:
 *   npx tsx scripts/backtest/decay.ts <touches.json> --yes <asset> --no <asset>
 *     [--threshold 0.01] [--horizons 100,250,500,1000,2000,5000]
 *
 * Export touches with DuckDB first (see src/backtest/decay.ts header).
 * Prints JSON: tick count, episode count, median decay, per-horizon survival.
 */

import { readFileSync } from 'node:fs';
import {
  parseTouchRowsText,
  touchRowsToTicks,
  traceEdgeEpisodes,
  summarizeDecay,
  DEFAULT_DECAY_HORIZONS_MS,
} from '../../src/backtest/decay.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [touchFile] = positional;
const yes = flag('--yes');
const no = flag('--no');
if (!touchFile || !yes || !no) {
  console.error('Usage: decay.ts <touches.json> --yes <asset> --no <asset> [--threshold 0.01] [--horizons 100,250,500,1000,2000,5000]');
  process.exit(1);
}

const threshold = Number(flag('--threshold') ?? 0.01);
const horizons = (flag('--horizons') ?? '')
  .split(',')
  .map(Number)
  .filter((n) => Number.isFinite(n) && n > 0);
const horizonsMs = horizons.length ? horizons : DEFAULT_DECAY_HORIZONS_MS;

const rows = parseTouchRowsText(readFileSync(touchFile, 'utf8'));
const ticks = touchRowsToTicks(rows, yes, no);
const episodes = traceEdgeEpisodes(ticks, { threshold, horizonsMs });
const summary = summarizeDecay(ticks, episodes, { threshold, horizonsMs });

console.log(JSON.stringify({ touchRows: rows.length, threshold, ...summary }, null, 2));

/**
 * Market-correlation report from poly_data trades.csv.
 *
 * Usage:
 *   npx tsx scripts/backtest/correlation.ts <trades.csv> [--top 20] [--pairs 20]
 *
 * Prints wallet overlap pairs, per-wallet concentration, and crowded markets.
 * trades.csv is huge in practice — pre-filter to candidate makers first.
 */

import { readFileSync } from 'node:fs';
import { parsePolyTradesCsv, matchRoundTrips } from '../../src/backtest/smart-money.js';
import { walletOverlap, walletConcentration, crowdedMarkets } from '../../src/backtest/correlation.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [csvFile] = positional;
if (!csvFile) {
  console.error('Usage: correlation.ts <trades.csv> [--top 20] [--pairs 20]');
  process.exit(1);
}

const trades = parsePolyTradesCsv(readFileSync(csvFile, 'utf8'));
const trips = matchRoundTrips(trades);

console.log(
  JSON.stringify(
    {
      fills: trades.length,
      wallets: new Set(trades.map((t) => t.maker)).size,
      topPairs: walletOverlap(trades).slice(0, Number(flag('--pairs') ?? 20)),
      concentration: walletConcentration(trades).slice(0, Number(flag('--top') ?? 20)),
      crowded: crowdedMarkets(trades, trips).slice(0, Number(flag('--top') ?? 20)),
    },
    null,
    2
  )
);

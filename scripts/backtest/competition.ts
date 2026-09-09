/**
 * Competition analysis — who else fishes the crowded markets?
 *
 * Usage:
 *   npx tsx scripts/backtest/competition.ts <trades.csv> [--markets m1,m2]
 *     [--markets-file candidates.json] [--min-markets 2] [--top 20]
 *
 * Prints per-market taker concentration, repeat takers across the set, and
 * maker↔taker overlap. Pre-slice trades.csv to the markets of interest.
 */

import { readFileSync } from 'node:fs';
import { parsePolyTradesCsv } from '../../src/backtest/smart-money.js';
import { takerConcentration, repeatTakers, makerTakerOverlap, makerPairBuys } from '../../src/backtest/competition.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [csvFile] = positional;
if (!csvFile) {
  console.error('Usage: competition.ts <trades.csv> [--markets m1,m2] [--markets-file f.json] [--min-markets 2] [--top 20]');
  process.exit(1);
}

let marketIds: string[] = (flag('--markets') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const marketsFile = flag('--markets-file');
if (marketsFile) {
  const raw = JSON.parse(readFileSync(marketsFile, 'utf8')) as unknown;
  const ids = Array.isArray(raw) ? raw : (raw as { ids?: unknown }).ids;
  if (Array.isArray(ids)) marketIds = ids.filter((x): x is string => typeof x === 'string');
}
const minMarkets = Number(flag('--min-markets') ?? 2);
const top = Number(flag('--top') ?? 20);

const trades = parsePolyTradesCsv(readFileSync(csvFile, 'utf8'));
const set = new Set(marketIds.length > 0 ? marketIds : [...new Set(trades.map((t) => t.market_id))]);

console.log(
  JSON.stringify(
    {
      fills: trades.length,
      markets: set.size,
      takerConcentration: [...set]
        .map((m) => takerConcentration(trades, m))
        .filter((c) => c !== null)
        .sort((a, b) => b!.notionalUsd - a!.notionalUsd)
        .slice(0, top),
      repeatTakers: repeatTakers(trades, set, minMarkets).slice(0, top),
      makerTakerOverlap: makerTakerOverlap(trades).slice(0, top),
      makerPairBuys: makerPairBuys(trades, {
        windowMs: Number(flag('--pair-window-ms') ?? 60_000),
        maxPairCost: Number(flag('--max-pair-cost') ?? 1),
      }).slice(0, top),
    },
    null,
    2
  )
);

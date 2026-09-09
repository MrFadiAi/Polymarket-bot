/**
 * Cross-market divergence scan.
 *
 * Usage:
 *   npx tsx scripts/backtest/xmarket.ts <trades.csv> <candidates.json>
 *     [--bucket-ms 60000] [--threshold 0.02] [--top 20]
 *
 * candidates.json: [{ question, ids: [market_id, ...] }, ...] — produced by
 * grouping markets.csv on (question, end_date, game_start) and keeping small
 * groups with >=2 markets active in the fills window. trades.csv should be
 * pre-sliced to those ids.
 */

import { readFileSync } from 'node:fs';
import { parsePolyTradesCsv } from '../../src/backtest/smart-money.js';
import { scanGroups } from '../../src/backtest/xmarket.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [csvFile, candFile] = positional;
if (!csvFile || !candFile) {
  console.error('Usage: xmarket.ts <trades.csv> <candidates.json> [--bucket-ms 60000] [--threshold 0.02] [--top 20]');
  process.exit(1);
}

const candidates = JSON.parse(readFileSync(candFile, 'utf8')) as { question: string; ids: string[] }[];
const idSet = new Set(candidates.flatMap((c) => c.ids));
const trades = parsePolyTradesCsv(readFileSync(csvFile, 'utf8')).filter((t) => idSet.has(t.market_id));

const summaries = scanGroups(
  trades.map((t) => ({ market_id: t.market_id, ts: t.ts, price: t.price, qty: t.token_amount, side: t.nonusdc_side })),
  candidates.map((c) => c.ids),
  { bucketMs: Number(flag('--bucket-ms') ?? 60_000), threshold: Number(flag('--threshold') ?? 0.02) }
);

const qByPair = new Map<string, string>();
for (const c of candidates) {
  for (const a of c.ids) for (const b of c.ids) qByPair.set(`${a}|${b}`, c.question);
}

const top = Number(flag('--top') ?? 20);
console.log(
  JSON.stringify(
    {
      fills: trades.length,
      groups: candidates.length,
      pairs: summaries.length,
      divergedPairs: summaries.filter((s) => s.divergedBuckets > 0).length,
      top: summaries.slice(0, top).map((s) => ({
        question: (qByPair.get(`${s.marketA}|${s.marketB}`) ?? '').slice(0, 80),
        overlapBuckets: s.overlapBuckets,
        divergedBuckets: s.divergedBuckets,
        maxAbsDiff: s.maxAbsDiff,
        sample: s.divergences.slice(0, 3),
      })),
    },
    null,
    2
  )
);

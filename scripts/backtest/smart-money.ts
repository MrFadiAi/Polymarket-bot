/**
 * Smart Money discovery + copy-trade simulation from poly_data trades.csv.
 *
 * Usage:
 *   npx tsx scripts/backtest/smart-money.ts <trades.csv> [--top 20]
 *     [--maker 0x...] [--fee-bps 0] [--slippage-bps 0]
 *     [--delay-ms 0] [--max-stale-ms 5000] [--min-copy-usd 10]
 *     [--copy-side BUY|SELL]
 *
 * Prints a JSON report: per-wallet quality (live 6-layer gate), copy-trade
 * metrics (Sharpe, max drawdown, win rate), and copyability under an assumed
 * detection delay (live 5s stale guard + $10 min copy; spread/premium guards
 * need an orderbook and are not modeled). trades.csv is huge in practice —
 * pre-filter to candidate makers/markets first (e.g. DuckDB).
 */

import { readFileSync } from 'node:fs';
import { parsePolyTradesCsv, discoverWallets } from '../../src/backtest/smart-money.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [csvFile] = positional;
if (!csvFile) {
  console.error(
    'Usage: smart-money.ts <trades.csv> [--top 20] [--maker 0x...] [--fee-bps 0] [--slippage-bps 0] [--delay-ms 0] [--max-stale-ms 5000] [--min-copy-usd 10] [--copy-side BUY|SELL]'
  );
  process.exit(1);
}

const top = Number(flag('--top') ?? 20);
const onlyMaker = flag('--maker')?.toLowerCase();
const feeBps = Number(flag('--fee-bps') ?? 0);
const slippageBps = Number(flag('--slippage-bps') ?? 0);
const copySide = flag('--copy-side')?.toUpperCase();
if (copySide !== undefined && copySide !== 'BUY' && copySide !== 'SELL') {
  console.error('--copy-side must be BUY or SELL');
  process.exit(1);
}

const trades = parsePolyTradesCsv(readFileSync(csvFile, 'utf8'));
let reports = discoverWallets(trades, {
  feeBps,
  slippageBps,
  copyability: {
    detectionDelayMs: Number(flag('--delay-ms') ?? 0),
    maxStalenessMs: Number(flag('--max-stale-ms') ?? 5000),
    minTradeValueUsd: Number(flag('--min-copy-usd') ?? 10),
    ...(copySide ? { sideFilter: copySide as 'BUY' | 'SELL' } : {}),
  },
});
if (onlyMaker) reports = reports.filter((r) => r.wallet === onlyMaker);

const summarize = (r: (typeof reports)[number]) => ({
  wallet: r.wallet,
  fills: r.fills,
  roundTrips: r.roundTrips.length,
  winRate: r.quality.winRate,
  totalPnl: r.quality.totalPnl,
  profitFactor: r.quality.profitFactor,
  consistency: r.quality.consistencyScore,
  gate: r.gate,
  copy: {
    trades: r.copy.metrics.trades,
    winRate: r.copy.metrics.winRate,
    totalPnl: r.copy.metrics.totalPnl,
    maxDrawdown: r.copy.metrics.maxDrawdown,
    sharpe: r.copy.sharpe,
  },
  copyability: r.copyability,
});

console.log(
  JSON.stringify(
    {
      fills: trades.length,
      wallets: reports.length,
      qualifying: reports.filter((r) => r.gate.pass).map((r) => r.wallet),
      top: reports.slice(0, top).map(summarize),
    },
    null,
    2
  )
);

/**
 * Example 14: Enriched smart-money filtering via Monid (optional provider)
 *
 * The default smart-money path filters traders by raw PnL only, because Polymarket's
 * free leaderboard doesn't expose win-rate / profit-factor. This example wires an optional
 * Monid provider that returns those metrics inline, so the README's "60%+ win rate,
 * 1.5x profit factor" filter actually works — no per-wallet position crawl needed.
 *
 * Requires a Monid key (https://app.monid.ai):  export MONID_API_KEY=monid_live_...
 *
 * Run: npx tsx examples/14-monid-smart-money.ts
 */

import { MonidLeaderboardProvider } from '../src/index.js';

async function main() {
  const apiKey = process.env.MONID_API_KEY;
  if (!apiKey) {
    console.error('Set MONID_API_KEY=monid_live_... first (https://app.monid.ai).');
    process.exit(1);
  }

  const provider = new MonidLeaderboardProvider({ apiKey });

  console.log('Fetching smart money with winRate >= 60% and profitFactor >= 1.5 ...\n');
  const rows = await provider.fetchLeaderboard({
    period: 'all',
    limit: 100,
    minPnl: 1000,
    minWinRate: 0.6,
    minProfitFactor: 1.5,
  });

  console.log(`${rows.length} traders passed the filter:\n`);
  for (const r of rows.slice(0, 15)) {
    const styles = Object.entries(r.tradingStyles ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/^is/, '').toLowerCase());
    console.log(
      `#${r.rank} ${r.address.slice(0, 8)}…  ` +
        `pnl=$${Math.round(r.pnl).toLocaleString()}  ` +
        `win=${r.winRate != null ? (r.winRate * 100).toFixed(0) + '%' : '—'}  ` +
        `pf=${r.profitFactor?.toFixed(2) ?? '—'}  ` +
        `${styles.join(',')}`
    );
  }

  // Drop-in: this same provider can be injected into SmartMoneyService via
  //   smartMoney.setLeaderboardProvider(provider)
  // so the whole copy-trade pipeline filters on win-rate / profit-factor.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

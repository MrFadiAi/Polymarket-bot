/**
 * Market Research - ARB + MM + HYBRID Analysis
 */

import { PolymarketSDK } from '../src/index.js';

const sdk = new PolymarketSDK();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   ARB + MM + HYBRID Market Research                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  console.log('\nFetching top markets by volume...\n');

  const markets = await sdk.gammaApi.getMarkets({
    active: true,
    closed: false,
    order: 'volume24hr',
    ascending: false,
    limit: 50,
  });

  console.log(`Found ${markets.length} markets. Analyzing...\n`);

  interface MarketResult {
    question: string;
    conditionId: string;
    vol24h: number;
    avgSpread: number;
    longArb: number;
    shortArb: number;
    mid: number;
    minDepth: number;
    yesBid: number;
    yesAsk: number;
    noBid: number;
    noAsk: number;
  }

  const results: MarketResult[] = [];

  for (const market of markets) {
    if (!market.conditionId) continue;

    try {
      const ob = await sdk.clobApi.getProcessedOrderbook(market.conditionId);

      if (ob.yes.bid < 0.01 || ob.no.bid < 0.01) continue;

      const vol24h = market.volume24hr || 0;
      const yesSpread = ob.summary.yesSpread || (ob.yes.ask - ob.yes.bid);
      const noSpread = ob.summary.noSpread || (ob.no.ask - ob.no.bid);
      const avgSpread = (yesSpread + noSpread) / 2;
      const longCost = ob.summary.effectiveLongCost;
      const shortRev = ob.summary.effectiveShortRevenue;
      const longArb = 1 - longCost;
      const shortArb = shortRev - 1;
      const mid = (ob.yes.bid + ob.yes.ask) / 2;
      const minDepth = Math.min(ob.yes.bidDepth, ob.yes.askDepth, ob.no.bidDepth, ob.no.askDepth);

      results.push({
        question: market.question || 'Unknown',
        conditionId: market.conditionId,
        vol24h,
        avgSpread,
        longArb,
        shortArb,
        mid,
        minDepth,
        yesBid: ob.yes.bid,
        yesAsk: ob.yes.ask,
        noBid: ob.no.bid,
        noAsk: ob.no.ask,
      });

      process.stdout.write('.');
    } catch {
      process.stdout.write('x');
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n');

  // Categorize
  const arb = results.filter(r => r.longArb > 0 || r.shortArb > 0);
  const mm = results.filter(r => r.avgSpread >= 0.01 && r.vol24h >= 10000 && r.minDepth >= 1000);
  const hybrid = results.filter(r => r.mid >= 0.25 && r.mid <= 0.75 && r.vol24h >= 5000);

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🎯 ARBITRAGE OPPORTUNITIES:', arb.length);
  console.log('═══════════════════════════════════════════════════════════════════════════');

  if (arb.length === 0) {
    console.log('  No direct arbitrage found (market efficient)\n');

    // Show closest to arb
    const sorted = [...results].sort((a, b) => Math.max(a.longArb, a.shortArb) - Math.max(b.longArb, b.shortArb)).reverse();
    console.log('  Closest to arbitrage:');
    for (const r of sorted.slice(0, 3)) {
      const profit = Math.max(r.longArb, r.shortArb);
      console.log(`    ${r.question.slice(0, 50)}... → ${(profit * 100).toFixed(3)}%`);
    }
  } else {
    for (const r of arb.slice(0, 5)) {
      const type = r.longArb > r.shortArb ? 'LONG' : 'SHORT';
      const profit = Math.max(r.longArb, r.shortArb);
      console.log(`\n  ${r.question.slice(0, 60)}...`);
      console.log(`    ${type} ARB: ${(profit * 100).toFixed(3)}%`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📊 MARKET MAKING CANDIDATES:', mm.length);
  console.log('═══════════════════════════════════════════════════════════════════════════');

  const mmSorted = [...mm].sort((a, b) => {
    // Score: spread * volume * sqrt(depth)
    const scoreA = a.avgSpread * Math.log(a.vol24h) * Math.sqrt(a.minDepth);
    const scoreB = b.avgSpread * Math.log(b.vol24h) * Math.sqrt(b.minDepth);
    return scoreB - scoreA;
  });

  for (const r of mmSorted.slice(0, 10)) {
    console.log(`\n  ${r.question.slice(0, 60)}...`);
    console.log(`    Spread: ${(r.avgSpread * 100).toFixed(2)}% | Vol: $${(r.vol24h/1000).toFixed(0)}K | Depth: $${(r.minDepth/1000).toFixed(0)}K`);
    console.log(`    YES: ${r.yesBid.toFixed(3)}/${r.yesAsk.toFixed(3)} | NO: ${r.noBid.toFixed(3)}/${r.noAsk.toFixed(3)}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('🔄 HYBRID CANDIDATES (uncertain markets 25-75%):', hybrid.length);
  console.log('═══════════════════════════════════════════════════════════════════════════');

  const hybridSorted = [...hybrid].sort((a, b) => {
    // Prefer prices closer to 50%
    const distA = Math.abs(a.mid - 0.5);
    const distB = Math.abs(b.mid - 0.5);
    return distA - distB;
  });

  for (const r of hybridSorted.slice(0, 10)) {
    console.log(`\n  ${r.question.slice(0, 60)}...`);
    console.log(`    Price: ${(r.mid * 100).toFixed(1)}¢ | Vol: $${(r.vol24h/1000).toFixed(0)}K | Spread: ${(r.avgSpread * 100).toFixed(2)}%`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Total analyzed:        ${results.length}`);
  console.log(`  Arb opportunities:     ${arb.length}`);
  console.log(`  MM candidates:         ${mm.length}`);
  console.log(`  Hybrid candidates:     ${hybrid.length}`);

  if (mm.length > 0) {
    console.log(`\n  🏆 Top MM recommendation:`);
    console.log(`     ${mmSorted[0].question.slice(0, 60)}...`);
  }
  if (hybrid.length > 0) {
    console.log(`  🏆 Top Hybrid recommendation:`);
    console.log(`     ${hybridSorted[0].question.slice(0, 60)}...`);
  }
}

main().catch(console.error);

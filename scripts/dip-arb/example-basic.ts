#!/usr/bin/env npx tsx
/**
 * Example 14: DipArbService - Dip Arbitrage for 15m/5m UP/DOWN Markets
 *
 * Demonstrates the dip arbitrage workflow for Polymarket's short-term crypto markets:
 * 1. Scan for upcoming BTC/ETH/SOL/XRP UP/DOWN markets
 * 2. Auto-select and start monitoring a market
 * 3. Detect dip signals (price drops > threshold)
 * 4. Execute Leg1 + Leg2 trades for risk-free profit
 * 5. Auto-rotate to next market when current ends
 *
 * Strategy Overview:
 * - Leg1: Buy the dipped side when price drops >= dipThreshold (default 15%)
 * - Leg2: Buy the opposite side when combined cost < sumTarget (default 0.95)
 * - Profit: Total cost < $1 means guaranteed profit at settlement
 *
 * Environment variables:
 *   POLY_PRIVKEY - Private key for trading (required for execution)
 *
 * Run with:
 *   pnpm example:dip-arb
 *
 * Or monitor-only (no trading):
 *   npx tsx examples/14-dip-arb-service.ts --monitor-only
 *
 * With auto-rotate:
 *   npx tsx examples/14-dip-arb-service.ts --auto-rotate
 */

import { PolymarketSDK } from '../../src/index.js';

// Parse arguments
const args = process.argv.slice(2);
const MONITOR_ONLY = args.includes('--monitor-only');
const AUTO_ROTATE = args.includes('--auto-rotate');
const COIN = args.find(a => a.startsWith('--coin='))?.split('=')[1] as 'BTC' | 'ETH' | 'SOL' | 'XRP' | undefined;
const RUN_DURATION = parseInt(args.find(a => a.startsWith('--duration='))?.split('=')[1] || '300') * 1000; // default 5 minutes

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              DipArbService - Dip Arbitrage Demo                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();

  const privateKey = process.env.POLY_PRIVKEY;

  if (!privateKey && !MONITOR_ONLY) {
    console.log('No POLY_PRIVKEY provided. Running in monitor-only mode.\n');
  }

  // ========== Initialize SDK ==========
  console.log('Initializing SDK...');
  const sdk = await PolymarketSDK.create({
    privateKey: MONITOR_ONLY ? undefined : privateKey,
  });
  console.log('SDK initialized\n');

  // ========== Configure DipArbService ==========
  sdk.dipArb.updateConfig({
    shares: 20,              // Buy 20 shares per leg
    sumTarget: 0.95,         // Target total cost <= $0.95 (5% profit)
    dipThreshold: 0.15,      // Trigger when price drops 15%
    windowMinutes: 2,        // Trade window after round starts
    maxSlippage: 0.02,       // Max 2% slippage
    minProfitRate: 0.03,     // Min 3% profit rate
    leg2TimeoutSeconds: 300, // 5 min timeout for leg2
    enableSurge: true,       // Also detect surges
    autoMerge: true,         // Auto merge after both legs
    autoExecute: !MONITOR_ONLY && !!privateKey,
    debug: true,
  });

  console.log('Configuration:');
  console.log(JSON.stringify(sdk.dipArb.getConfig(), null, 2));
  console.log();

  // ========== Set up event listeners ==========
  sdk.dipArb.on('started', (market) => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`🚀 Started monitoring: ${market.name}`);
    console.log(`   Condition ID: ${market.conditionId.slice(0, 20)}...`);
    console.log(`   Underlying: ${market.underlying} | Duration: ${market.durationMinutes}m`);
    console.log(`   End Time: ${market.endTime.toLocaleString()}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
  });

  sdk.dipArb.on('stopped', () => {
    console.log('\n🛑 Service stopped');
  });

  sdk.dipArb.on('newRound', (event) => {
    console.log(`\n📍 New Round: ${event.roundId}`);
    console.log(`   Price to Beat: $${event.priceToBeat.toFixed(2)}`);
    console.log(`   UP Open: ${event.upOpen.toFixed(4)} | DOWN Open: ${event.downOpen.toFixed(4)}`);
  });

  sdk.dipArb.on('signal', (signal) => {
    if (signal.type === 'leg1') {
      console.log(`\n🎯 LEG1 SIGNAL [${signal.source.toUpperCase()}]`);
      console.log(`   Buy ${signal.dipSide} @ ${signal.currentPrice.toFixed(4)}`);
      console.log(`   Drop: ${(signal.dropPercent * 100).toFixed(1)}%`);
      console.log(`   Opposite Ask: ${signal.oppositeAsk.toFixed(4)}`);
      console.log(`   Est Total Cost: ${signal.estimatedTotalCost.toFixed(4)}`);
      console.log(`   Est Profit Rate: ${(signal.estimatedProfitRate * 100).toFixed(2)}%`);
      if (signal.btcInfo) {
        console.log(`   ${signal.btcInfo.btcPrice > 0 ? 'BTC' : 'Underlying'}: $${signal.btcInfo.btcPrice.toFixed(2)} (${signal.btcInfo.btcChangePercent >= 0 ? '+' : ''}${signal.btcInfo.btcChangePercent.toFixed(2)}%)`);
      }
    } else {
      console.log(`\n🎯 LEG2 SIGNAL`);
      console.log(`   Buy ${signal.hedgeSide} @ ${signal.currentPrice.toFixed(4)}`);
      console.log(`   Leg1 was: ${signal.leg1.side} @ ${signal.leg1.price.toFixed(4)}`);
      console.log(`   Total Cost: ${signal.totalCost.toFixed(4)}`);
      console.log(`   Expected Profit Rate: ${(signal.expectedProfitRate * 100).toFixed(2)}%`);
    }
  });

  sdk.dipArb.on('execution', (result) => {
    if (result.success) {
      console.log(`\n✅ ${result.leg.toUpperCase()} Executed!`);
      if (result.side) console.log(`   Side: ${result.side}`);
      if (result.price) console.log(`   Price: ${result.price.toFixed(4)}`);
      if (result.shares) console.log(`   Shares: ${result.shares}`);
      if (result.orderId) console.log(`   Order ID: ${result.orderId}`);
      console.log(`   Time: ${result.executionTimeMs}ms`);
    } else {
      console.log(`\n❌ ${result.leg.toUpperCase()} Failed: ${result.error}`);
    }
  });

  sdk.dipArb.on('roundComplete', (result) => {
    console.log(`\n📊 Round ${result.roundId} Complete`);
    console.log(`   Status: ${result.status}`);
    if (result.totalCost !== undefined) {
      console.log(`   Total Cost: ${result.totalCost.toFixed(4)}`);
      console.log(`   Profit: $${result.profit?.toFixed(4)}`);
      console.log(`   Profit Rate: ${((result.profitRate || 0) * 100).toFixed(2)}%`);
    }
    console.log(`   Merged: ${result.merged ? 'Yes' : 'No'}`);
  });

  sdk.dipArb.on('priceUpdate', (event) => {
    // Only log significant price changes
    if (Math.abs(event.changePercent) >= 0.5) {
      console.log(`   ${event.underlying}: $${event.value.toFixed(2)} (${event.changePercent >= 0 ? '+' : ''}${event.changePercent.toFixed(2)}% vs PTB)`);
    }
  });

  sdk.dipArb.on('rotate', (event) => {
    console.log(`\n🔄 Market Rotation`);
    console.log(`   Reason: ${event.reason}`);
    console.log(`   Previous: ${event.previousMarket?.slice(0, 20) || 'none'}...`);
    console.log(`   New: ${event.newMarket.slice(0, 20)}...`);
  });

  sdk.dipArb.on('settled', (result) => {
    console.log(`\n💰 Position Settled`);
    console.log(`   Strategy: ${result.strategy}`);
    console.log(`   Success: ${result.success}`);
    if (result.amountReceived) {
      console.log(`   Amount: $${result.amountReceived.toFixed(2)}`);
    }
  });

  sdk.dipArb.on('error', (error) => {
    console.error(`\n❌ Error: ${error.message}`);
  });

  // ========== Enable auto-rotate if requested ==========
  if (AUTO_ROTATE) {
    sdk.dipArb.enableAutoRotate({
      underlyings: COIN ? [COIN] : ['BTC', 'ETH'],
      duration: '15m',
      autoSettle: true,
      settleStrategy: 'sell', // 'sell' is faster, 'redeem' waits for resolution
      preloadMinutes: 2,
    });
    console.log('Auto-rotate enabled\n');
  }

  // ========== Scan for markets ==========
  console.log('Scanning for upcoming markets...\n');
  const markets = await sdk.dipArb.scanUpcomingMarkets({
    coin: COIN || 'all',
    duration: '15m',
    minMinutesUntilEnd: 10,
    maxMinutesUntilEnd: 60,
    limit: 10,
  });

  if (markets.length === 0) {
    console.log('No suitable markets found. Try again later.\n');
    sdk.stop();
    return;
  }

  console.log(`Found ${markets.length} markets:\n`);
  markets.forEach((m, i) => {
    const minutesLeft = Math.round((m.endTime.getTime() - Date.now()) / 60000);
    console.log(`  ${i + 1}. [${m.underlying}] ${m.slug}`);
    console.log(`     Ends in ${minutesLeft} minutes`);
  });
  console.log();

  // ========== Start monitoring ==========
  const market = await sdk.dipArb.findAndStart({
    coin: COIN,
    preferDuration: '15m',
  });

  if (!market) {
    console.log('Could not start monitoring. Exiting.\n');
    sdk.stop();
    return;
  }

  // ========== Run for specified duration ==========
  console.log(`Running for ${RUN_DURATION / 1000} seconds...`);
  console.log('Press Ctrl+C to stop early.\n');

  await new Promise(resolve => setTimeout(resolve, RUN_DURATION));

  // ========== Print final stats ==========
  const stats = sdk.dipArb.getStats();
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 Final Statistics');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Rounds Monitored: ${stats.roundsMonitored}`);
  console.log(`Rounds Completed: ${stats.roundsCompleted}`);
  console.log(`Rounds Successful: ${stats.roundsSuccessful}`);
  console.log(`Rounds Expired: ${stats.roundsExpired}`);
  console.log(`Signals Detected: ${stats.signalsDetected}`);
  console.log(`Leg1 Filled: ${stats.leg1Filled}`);
  console.log(`Leg2 Filled: ${stats.leg2Filled}`);
  console.log(`Total Spent: $${stats.totalSpent.toFixed(2)}`);
  console.log(`Total Profit: $${stats.totalProfit.toFixed(2)}`);
  console.log(`Running Time: ${(stats.runningTimeMs / 1000).toFixed(1)}s`);
  console.log();

  // ========== Clean up ==========
  sdk.stop();
  console.log('Done!\n');
}

main().catch(console.error);

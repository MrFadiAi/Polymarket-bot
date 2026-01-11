/**
 * Test Script: SmartMoneyService
 *
 * Verifies SmartMoneyService functionality:
 * - Smart Money detection from leaderboard
 * - Real-time trade subscription
 * - Position syncing
 */

import {
  SmartMoneyService,
  WalletService,
  RealtimeServiceV2,
  TradingService,
  DataApiClient,
  SubgraphClient,
  RateLimiter,
  createUnifiedCache,
} from '../../src/index.js';
import { Wallet } from 'ethers';

async function main() {
  console.log('='.repeat(60));
  console.log('SmartMoneyService Test');
  console.log('='.repeat(60));

  // Initialize dependencies
  const cache = createUnifiedCache();
  const rateLimiter = new RateLimiter();
  const dataApi = new DataApiClient(rateLimiter, cache);
  const subgraph = new SubgraphClient(rateLimiter, cache);

  // Create services
  const walletService = new WalletService(dataApi, subgraph, cache);
  const realtimeService = new RealtimeServiceV2();

  // Create a read-only TradingService with random wallet (for testing only)
  // Note: This won't be used for actual trading in this test
  const randomWallet = Wallet.createRandom();
  const tradingService = new TradingService(rateLimiter, cache, {
    privateKey: randomWallet.privateKey,
    chainId: 137,
  });

  // Create SmartMoneyService
  const smartMoneyService = new SmartMoneyService(
    walletService,
    realtimeService,
    tradingService,
    {
      minPnl: 1000,      // Minimum $1000 PnL
      minPositions: 5,   // Minimum 5 positions
      minWinRate: 0.5,   // Minimum 50% win rate (estimated)
    }
  );

  try {
    // Test 1: Get Smart Money List
    console.log('\n[Test 1] Getting Smart Money list...');
    const smartMoneyList = await smartMoneyService.getSmartMoneyList(20);
    console.log(`Found ${smartMoneyList.length} Smart Money wallets`);

    if (smartMoneyList.length > 0) {
      console.log('\nTop 5 Smart Money wallets:');
      for (const wallet of smartMoneyList.slice(0, 5)) {
        console.log(`  ${wallet.rank}. ${wallet.address.slice(0, 10)}...`);
        console.log(`     PnL: $${wallet.pnl.toFixed(2)}, Score: ${wallet.score}`);
      }
    }

    // Test 2: Check if specific address is Smart Money
    if (smartMoneyList.length > 0) {
      console.log('\n[Test 2] Checking isSmartMoney...');
      const testAddress = smartMoneyList[0].address;
      const isSmart = await smartMoneyService.isSmartMoney(testAddress);
      console.log(`Address ${testAddress.slice(0, 10)}... is Smart Money: ${isSmart}`);
    }

    // Test 3: Sync positions for top Smart Money wallets
    if (smartMoneyList.length > 0) {
      console.log('\n[Test 3] Syncing positions for top 3 wallets...');
      const addresses = smartMoneyList.slice(0, 3).map(w => w.address);
      const snapshots = await smartMoneyService.syncPositions(addresses);

      for (const snapshot of snapshots) {
        console.log(`\n  ${snapshot.traderAddress.slice(0, 10)}...:`);
        console.log(`    Positions: ${snapshot.positions.length}`);
        if (snapshot.positions.length > 0) {
          const top = snapshot.positions[0];
          console.log(`    Top position: ${top.outcome} @ ${top.size.toFixed(2)} shares`);
        }
      }
    }

    // Test 4: Subscribe to Smart Money trades (5 second test)
    console.log('\n[Test 4] Subscribing to Smart Money trades (10 seconds)...');

    // Connect WebSocket
    realtimeService.connect();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
      realtimeService.once('connected', () => {
        clearTimeout(timeout);
        console.log('  WebSocket connected');
        resolve();
      });
      realtimeService.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    let tradeCount = 0;
    const subscription = smartMoneyService.subscribeSmartMoneyTrades(
      (trade) => {
        tradeCount++;
        console.log(`  [Trade ${tradeCount}] ${trade.traderAddress.slice(0, 10)}...`);
        console.log(`    ${trade.side} ${trade.size} @ $${trade.price.toFixed(4)}`);
        console.log(`    Smart Money: ${trade.isSmartMoney}`);
      },
      { minSize: 10 } // Only trades > $10
    );

    // Wait for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Unsubscribe
    subscription.unsubscribe();
    console.log(`\n  Received ${tradeCount} trades in 10 seconds`);

    // Cleanup
    smartMoneyService.disconnect();
    realtimeService.disconnect();

    console.log('\n' + '='.repeat(60));
    console.log('All tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nTest failed:', error);
    smartMoneyService.disconnect();
    realtimeService.disconnect();
    process.exit(1);
  }
}

main().catch(console.error);

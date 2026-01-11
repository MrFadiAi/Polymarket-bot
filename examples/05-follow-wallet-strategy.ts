/**
 * Example 5: Follow Wallet Strategy
 *
 * This example demonstrates:
 * - Tracking a smart money wallet's positions
 * - Detecting sell activity (for exit signals)
 * - Calculating sell ratio for position exit
 *
 * Run: npx ts-node examples/05-follow-wallet-strategy.ts
 */

import { PolymarketSDK, type Position, type Activity } from '../src/index.js';

interface WalletPositionTracker {
  address: string;
  position: Position;
  entryTimestamp: number;
  peakValue: number;
  cumulativeSellAmount: number;
  sellRatio: number;
}

async function detectSellActivity(
  sdk: PolymarketSDK,
  address: string,
  conditionId: string,
  sinceTimestamp: number
): Promise<{ totalSellAmount: number; sellTransactions: Activity[] }> {
  const activities = await sdk.dataApi.getActivity(address, { limit: 200, type: 'TRADE' });

  const sellTransactions = activities.filter(
    (a) =>
      a.conditionId === conditionId &&
      a.side === 'SELL' &&
      a.timestamp >= sinceTimestamp
  );

  const totalSellAmount = sellTransactions.reduce(
    (sum, a) => sum + (a.usdcSize || a.size * a.price),
    0
  );

  return { totalSellAmount, sellTransactions };
}

async function main() {
  console.log('=== Follow Wallet Strategy ===\n');

  const sdk = new PolymarketSDK();

  // 1. Get top traders from leaderboard
  console.log('1. Getting top traders from leaderboard...');
  const leaderboard = await sdk.dataApi.fetchLeaderboard({ limit: 5 });
  console.log(`   Found ${leaderboard.entries.length} top traders\n`);

  if (leaderboard.entries.length === 0) {
    console.log('No leaderboard entries found');
    return;
  }

  // 2. Select a trader to follow
  const traderToFollow = leaderboard.entries[0];
  console.log(`2. Following trader: ${traderToFollow.address.slice(0, 10)}...`);
  console.log(`   Rank: #${traderToFollow.rank}`);
  console.log(`   PnL: $${traderToFollow.pnl.toLocaleString()}\n`);

  // 3. Get their positions
  console.log('3. Getting positions...');
  const positions = await sdk.dataApi.getPositions(traderToFollow.address);
  console.log(`   Found ${positions.length} positions\n`);

  if (positions.length === 0) {
    console.log('No positions found for this trader');
    return;
  }

  // 4. Analyze each position for sell activity
  console.log('4. Analyzing positions for sell activity...\n');

  const trackers: WalletPositionTracker[] = [];
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const position of positions.slice(0, 5)) {
    console.log(`   Checking: ${position.title.slice(0, 50)}...`);

    try {
      // Get sell activity since 1 week ago
      const sellData = await detectSellActivity(
        sdk,
        traderToFollow.address,
        position.conditionId,
        oneWeekAgo
      );

      // Calculate peak value (current value + sells)
      const currentValue = position.currentValue || position.size * (position.curPrice || position.avgPrice);
      const peakValue = currentValue + sellData.totalSellAmount;

      // Calculate sell ratio
      const sellRatio = peakValue > 0 ? sellData.totalSellAmount / peakValue : 0;

      trackers.push({
        address: traderToFollow.address,
        position,
        entryTimestamp: oneWeekAgo, // Approximation
        peakValue,
        cumulativeSellAmount: sellData.totalSellAmount,
        sellRatio,
      });

      console.log(`     Current Value: $${currentValue.toFixed(2)}`);
      console.log(`     Cumulative Sells: $${sellData.totalSellAmount.toFixed(2)}`);
      console.log(`     Estimated Peak: $${peakValue.toFixed(2)}`);
      console.log(`     Sell Ratio: ${(sellRatio * 100).toFixed(1)}%`);

      // Check if 30% threshold is reached
      if (sellRatio >= 0.3) {
        console.log(`     ** EXIT SIGNAL: Sell ratio >= 30% **`);
      }
      console.log('');

    } catch (error) {
      console.log(`     Error: ${(error as Error).message}\n`);
    }
  }

  // 5. Summary
  console.log('=== Follow Wallet Summary ===\n');
  console.log(`Trader: ${traderToFollow.address.slice(0, 10)}...`);
  console.log(`Positions analyzed: ${trackers.length}\n`);

  const exitSignals = trackers.filter((t) => t.sellRatio >= 0.3);
  if (exitSignals.length > 0) {
    console.log(`EXIT SIGNALS (${exitSignals.length}):`);
    for (const signal of exitSignals) {
      console.log(`  - ${signal.position.title.slice(0, 40)}...`);
      console.log(`    Sell Ratio: ${(signal.sellRatio * 100).toFixed(1)}%`);
    }
  } else {
    console.log('No exit signals detected');
  }

  const holdingStrong = trackers.filter((t) => t.sellRatio < 0.1);
  if (holdingStrong.length > 0) {
    console.log(`\nSTRONG HOLDS (sell ratio < 10%):`);
    for (const hold of holdingStrong) {
      console.log(`  - ${hold.position.title.slice(0, 40)}...`);
      console.log(`    Outcome: ${hold.position.outcome}`);
      console.log(`    PnL: $${hold.position.cashPnl?.toFixed(2) || 'N/A'}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);

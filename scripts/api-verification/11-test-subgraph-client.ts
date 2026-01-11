/**
 * 测试 SubgraphClient 功能
 */

import { SubgraphClient } from '../../src/clients/subgraph.js';
import { RateLimiter } from '../../src/core/rate-limiter.js';
import { createUnifiedCache } from '../../src/core/unified-cache.js';

const TEST_ADDRESS = '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74';

async function main(): Promise<void> {
  console.log('🧪 测试 SubgraphClient\n');

  // 初始化
  const rateLimiter = new RateLimiter();
  const cache = createUnifiedCache();
  const client = new SubgraphClient(rateLimiter, cache);

  // ===== PnL Subgraph =====
  console.log('='.repeat(60));
  console.log('📊 1. PnL Subgraph');
  console.log('='.repeat(60));

  // getUserPositions
  console.log('\n📌 getUserPositions:');
  const positions = await client.getUserPositions(TEST_ADDRESS, { first: 3 });
  console.log(`  Found ${positions.length} positions`);
  if (positions.length > 0) {
    console.log(`  First: tokenId=${positions[0].tokenId.slice(0, 20)}... realizedPnl=${positions[0].realizedPnl}`);
  }

  // getConditions
  console.log('\n📌 getConditions:');
  const conditions = await client.getConditions({ first: 3 });
  console.log(`  Found ${conditions.length} conditions`);
  if (conditions.length > 0) {
    console.log(`  First: id=${conditions[0].id.slice(0, 20)}... resolved=${conditions[0].payoutNumerators.length > 0}`);
  }

  // isConditionResolved
  if (conditions.length > 0) {
    console.log('\n📌 isConditionResolved:');
    const isResolved = await client.isConditionResolved(conditions[0].id);
    console.log(`  Condition ${conditions[0].id.slice(0, 20)}... resolved=${isResolved}`);
  }

  // ===== Activity Subgraph =====
  console.log('\n' + '='.repeat(60));
  console.log('📊 2. Activity Subgraph');
  console.log('='.repeat(60));

  // getRecentRedemptions
  console.log('\n📌 getRecentRedemptions:');
  const redemptions = await client.getRecentRedemptions({ first: 5 });
  console.log(`  Found ${redemptions.length} recent redemptions`);
  if (redemptions.length > 0) {
    const r = redemptions[0];
    console.log(`  Latest: redeemer=${r.redeemer.slice(0, 10)}... payout=${r.payout} ts=${r.timestamp}`);
  }

  // getSplits
  console.log('\n📌 getSplits (any user):');
  const splits = await client.getSplits('0x0000000000000000000000000000000000000000', { first: 1 });
  // Use recent redemptions to find an active user
  if (redemptions.length > 0) {
    const activeUser = redemptions[0].redeemer;
    const userSplits = await client.getSplits(activeUser, { first: 3 });
    console.log(`  User ${activeUser.slice(0, 10)}... has ${userSplits.length} splits`);
  }

  // ===== OI Subgraph =====
  console.log('\n' + '='.repeat(60));
  console.log('📊 3. OI Subgraph');
  console.log('='.repeat(60));

  // getTopMarketsByOI
  console.log('\n📌 getTopMarketsByOI:');
  const topMarkets = await client.getTopMarketsByOI({ first: 5 });
  console.log(`  Found ${topMarkets.length} markets`);
  topMarkets.slice(0, 3).forEach((m, i) => {
    const oiUsd = (BigInt(m.amount) / BigInt(1e6)).toString();
    console.log(`  ${i + 1}. ${m.id.slice(0, 20)}... OI=$${Number(oiUsd).toLocaleString()}`);
  });

  // getGlobalOpenInterest
  console.log('\n📌 getGlobalOpenInterest:');
  const globalOI = await client.getGlobalOpenInterest();
  const globalOIUsd = (BigInt(globalOI) / BigInt(1e6)).toString();
  console.log(`  Global OI: $${Number(globalOIUsd).toLocaleString()}`);

  // getMarketOpenInterest
  if (topMarkets.length > 0) {
    console.log('\n📌 getMarketOpenInterest:');
    const marketOI = await client.getMarketOpenInterest(topMarkets[0].id);
    if (marketOI) {
      const oiUsd = (BigInt(marketOI.amount) / BigInt(1e6)).toString();
      console.log(`  Market ${marketOI.id.slice(0, 20)}... OI=$${Number(oiUsd).toLocaleString()}`);
    }
  }

  // ===== Orderbook Subgraph =====
  console.log('\n' + '='.repeat(60));
  console.log('📊 4. Orderbook Subgraph');
  console.log('='.repeat(60));

  // getOrderFilledEvents
  console.log('\n📌 getOrderFilledEvents:');
  const fills = await client.getOrderFilledEvents({ first: 5 });
  console.log(`  Found ${fills.length} recent fills`);
  if (fills.length > 0) {
    const f = fills[0];
    console.log(`  Latest: maker=${f.maker.slice(0, 10)}... taker=${f.taker.slice(0, 10)}...`);
    console.log(`          makerFilled=${f.makerAmountFilled} takerFilled=${f.takerAmountFilled}`);
  }

  // getMakerFills
  if (fills.length > 0) {
    console.log('\n📌 getMakerFills:');
    const makerFills = await client.getMakerFills(fills[0].maker, { first: 3 });
    console.log(`  Maker ${fills[0].maker.slice(0, 10)}... has ${makerFills.length} fills`);
  }

  // ===== 综合测试 =====
  console.log('\n' + '='.repeat(60));
  console.log('📊 5. 综合测试: getUserActivitySummary');
  console.log('='.repeat(60));

  // 使用一个活跃用户
  if (fills.length > 0) {
    const activeUser = fills[0].maker;
    console.log(`\n📌 User: ${activeUser}`);

    const summary = await client.getUserActivitySummary(activeUser);
    console.log(`  Positions: ${summary.positions.length}`);
    console.log(`  Splits: ${summary.splits.length}`);
    console.log(`  Merges: ${summary.merges.length}`);
    console.log(`  Redemptions: ${summary.redemptions.length}`);
    console.log(`  Maker Fills: ${summary.makerFills.length}`);
    console.log(`  Taker Fills: ${summary.takerFills.length}`);
  }

  // ===== 缓存测试 =====
  console.log('\n' + '='.repeat(60));
  console.log('📊 6. 缓存测试');
  console.log('='.repeat(60));

  console.log('\n📌 第一次请求 (无缓存):');
  const start1 = Date.now();
  await client.getGlobalOpenInterest();
  console.log(`  耗时: ${Date.now() - start1}ms`);

  console.log('\n📌 第二次请求 (有缓存):');
  const start2 = Date.now();
  await client.getGlobalOpenInterest();
  console.log(`  耗时: ${Date.now() - start2}ms`);

  console.log('\n✅ SubgraphClient 测试完成');
}

main().catch(console.error);

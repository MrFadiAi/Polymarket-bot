/**
 * 测试 P0/P1/P2 新功能
 *
 * 验证 DataApiClient 新增的参数支持是否正确工作
 */

import { DataApiClient } from '../../src/clients/data-api.js';
import { RateLimiter } from '../../src/core/rate-limiter.js';
import { createUnifiedCache } from '../../src/core/unified-cache.js';

const DATA_API = 'https://data-api.polymarket.com';

async function main(): Promise<void> {
  console.log('🧪 测试 P0/P1/P2 新功能\n');

  // 初始化客户端
  const rateLimiter = new RateLimiter();
  const cache = createUnifiedCache();
  const client = new DataApiClient(rateLimiter, cache);

  // 获取活跃用户
  const leaderboard = await client.getLeaderboard({ limit: 1 });
  const user = leaderboard.entries[0]?.address;
  console.log('测试用户:', user);

  // ===== P0 测试 =====
  console.log('\n=== P0: 时间过滤 + 分页 ===');

  // 1. Activity offset 分页
  console.log('\n📌 Activity offset 分页:');
  const page1 = await client.getActivity(user, { limit: 5 });
  const page2 = await client.getActivity(user, { limit: 5, offset: 5 });
  console.log(`  Page 1: ${page1.length} items, first ts: ${page1[0]?.timestamp}`);
  console.log(`  Page 2: ${page2.length} items, first ts: ${page2[0]?.timestamp}`);
  console.log(`  ✅ Offset 分页: ${page1[0]?.timestamp !== page2[0]?.timestamp ? '有效' : '⚠️ 可能无效'}`);

  // 2. Activity start/end 时间过滤
  console.log('\n📌 Activity start/end 时间过滤:');
  const allActivity = await client.getActivity(user, { limit: 20 });
  if (allActivity.length > 0) {
    const timestamps = allActivity.map((a) => Math.floor(a.timestamp / 1000)); // 转回秒
    const midTs = Math.floor((Math.min(...timestamps) + Math.max(...timestamps)) / 2);

    const afterMid = await client.getActivity(user, { limit: 20, start: midTs });
    const beforeMid = await client.getActivity(user, { limit: 20, end: midTs });

    console.log(`  All: ${allActivity.length}, After mid: ${afterMid.length}, Before mid: ${beforeMid.length}`);
    console.log(`  ✅ 时间过滤: ${afterMid.length < allActivity.length || beforeMid.length < allActivity.length ? '有效' : '⚠️ 可能无效'}`);
  }

  // 3. Positions limit/offset
  console.log('\n📌 Positions limit/offset:');
  const pos1 = await client.getPositions(user, { limit: 5 });
  const pos2 = await client.getPositions(user, { limit: 5, offset: 5 });
  console.log(`  Page 1: ${pos1.length} positions`);
  console.log(`  Page 2: ${pos2.length} positions`);
  console.log(`  ✅ Positions 分页: ${pos1.length > 0 || pos2.length > 0 ? '有效' : '无数据'}`);

  // ===== P1 测试 =====
  console.log('\n=== P1: 排序 + Value ===');

  // 4. Positions sortBy
  console.log('\n📌 Positions sortBy CASHPNL:');
  const posAsc = await client.getPositions(user, { sortBy: 'CASHPNL', sortDirection: 'ASC', limit: 3 });
  const posDesc = await client.getPositions(user, { sortBy: 'CASHPNL', sortDirection: 'DESC', limit: 3 });
  if (posAsc.length > 0 && posDesc.length > 0) {
    console.log(`  ASC first: ${posAsc[0]?.title?.slice(0, 30)} = $${posAsc[0]?.cashPnl?.toFixed(2)}`);
    console.log(`  DESC first: ${posDesc[0]?.title?.slice(0, 30)} = $${posDesc[0]?.cashPnl?.toFixed(2)}`);
    console.log(`  ✅ 排序: ${(posAsc[0]?.cashPnl ?? 0) < (posDesc[0]?.cashPnl ?? 0) ? '有效' : '⚠️ 可能无效'}`);
  }

  // 5. Value 端点
  console.log('\n📌 Value 端点:');
  const value = await client.getAccountValue(user);
  console.log(`  User: ${value.user}`);
  console.log(`  Value: $${value.value.toLocaleString()}`);
  console.log(`  ✅ Value 端点: ${value.value > 0 ? '有效' : '⚠️ 值为0'}`);

  // ===== P2 测试 =====
  console.log('\n=== P2: Trades user + Holders ===');

  // 6. Trades user 参数
  console.log('\n📌 Trades user 参数:');
  const userTrades = await client.getTradesByUser(user, { limit: 5 });
  console.log(`  User trades: ${userTrades.length} items`);
  if (userTrades.length > 0) {
    console.log(`  First trade: ${userTrades[0]?.title?.slice(0, 30)} @ $${userTrades[0]?.price?.toFixed(3)}`);
    console.log(`  ✅ Trades user: ${userTrades[0]?.proxyWallet?.toLowerCase() === user.toLowerCase() ? '有效' : '⚠️ 用户不匹配'}`);
  }

  // 7. Holders 端点 (可能超时)
  console.log('\n📌 Holders 端点:');
  try {
    // 用一个较小的市场测试
    const markets = await client.getPositions(user, { limit: 1 });
    if (markets.length > 0) {
      const conditionId = markets[0].conditionId;
      console.log(`  Testing market: ${conditionId.slice(0, 20)}...`);
      const holders = await client.getMarketHolders({ market: conditionId, limit: 5 });
      console.log(`  Holders: ${holders.length} items`);
      console.log(`  ✅ Holders 端点: 有效`);
    }
  } catch (error) {
    console.log(`  ⚠️ Holders 端点: ${String(error).slice(0, 50)}`);
  }

  // ===== 额外测试: getAllActivity =====
  console.log('\n=== 额外: getAllActivity 自动分页 ===');
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const allRecentActivity = await client.getAllActivity(user, { start: dayAgo }, 100);
  console.log(`  最近24小时活动: ${allRecentActivity.length} items`);

  console.log('\n✅ 所有测试完成');
}

main().catch(console.error);

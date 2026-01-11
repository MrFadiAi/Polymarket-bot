/**
 * Real Copy Trading Test - 真实下单测试
 *
 * ⚠️ 警告：这会执行真实交易！
 *
 * 运行：pnpm exec tsx scripts/smart-money/06-real-copy-test.ts
 */

import 'dotenv/config';
import { PolymarketSDK } from '../../src/index.js';

// ⚠️ 真实交易配置
const DRY_RUN = false;  // 真实交易！
const TOP_N = 50;
const SIZE_SCALE = 0.05;  // 跟 5% (确保 >= $1 最小订单)
const MAX_SIZE_PER_TRADE = 5;  // 最多 $5
const RUN_DURATION_MS = 60 * 1000; // 1 分钟

async function main() {
  console.log('='.repeat(60));
  console.log('🔴 REAL COPY TRADING TEST - 真实交易测试');
  console.log('='.repeat(60));
  console.log(`Size Scale: ${SIZE_SCALE * 100}%`);
  console.log(`Max per trade: $${MAX_SIZE_PER_TRADE}`);
  console.log(`Duration: ${RUN_DURATION_MS / 1000}s`);
  console.log('='.repeat(60));

  const privateKey = process.env.PRIVATE_KEY || process.env.POLY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found');
    process.exit(1);
  }

  // 使用静态工厂方法一步启动（推荐）
  console.log('\n[Init] 初始化 SDK...');
  const sdk = await PolymarketSDK.create({ privateKey });
  console.log('  ✅ SDK ready (initialized + WebSocket connected)');

  const subscription = await sdk.smartMoney.startAutoCopyTrading({
    topN: TOP_N,
    sizeScale: SIZE_SCALE,
    maxSizePerTrade: MAX_SIZE_PER_TRADE,
    maxSlippage: 0.05,  // 5% slippage for real trades
    orderType: 'FOK',
    minTradeSize: 5,
    dryRun: DRY_RUN,
    onTrade: (trade, result) => {
      const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
      console.log(`\n${status}`);
      console.log(`  Trader: ${trade.traderName || trade.traderAddress.slice(0, 10)}...`);
      console.log(`  Market: ${trade.marketSlug}`);
      console.log(`  ${trade.side} ${trade.outcome} @ $${trade.price.toFixed(4)}`);
      if (result.orderId) console.log(`  OrderId: ${result.orderId}`);
      if (result.errorMsg) console.log(`  Error: ${result.errorMsg}`);
    },
    onError: (error) => {
      console.error('\n❌ Error:', error.message);
    },
  });

  console.log(`\n✅ 跟踪 ${subscription.targetAddresses.length} 个钱包`);
  console.log('⏳ 监听中... (真实交易模式)\n');

  // Run for duration
  await new Promise(resolve => setTimeout(resolve, RUN_DURATION_MS));

  // Stats
  const stats = subscription.getStats();
  console.log('\n' + '='.repeat(60));
  console.log('📊 运行统计');
  console.log('='.repeat(60));
  console.log(`  检测交易: ${stats.tradesDetected}`);
  console.log(`  执行跟单: ${stats.tradesExecuted}`);
  console.log(`  跳过交易: ${stats.tradesSkipped}`);
  console.log(`  失败交易: ${stats.tradesFailed}`);
  console.log(`  总花费: $${stats.totalUsdcSpent.toFixed(2)}`);

  subscription.stop();
  sdk.stop();

  console.log('\n✅ Done');
}

main().catch(console.error);

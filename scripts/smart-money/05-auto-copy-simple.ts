/**
 * Auto Copy Trading (Simplified) - 最简化的自动跟单
 *
 * 展示三种初始化方式：
 * 1. PolymarketSDK.create() - 静态工厂方法（推荐）
 * 2. sdk.start() - 一步启动
 * 3. 手动分步初始化
 *
 * 运行：pnpm exec tsx scripts/smart-money/05-auto-copy-simple.ts
 */

import 'dotenv/config';
import { PolymarketSDK } from '../../src/index.js';

const DRY_RUN = true;
const TOP_N = 50;
const RUN_DURATION_MS = 60 * 1000;

async function main() {
  console.log('='.repeat(60));
  console.log('🤖 Auto Copy Trading - Simplified API');
  console.log('='.repeat(60));

  const privateKey = process.env.PRIVATE_KEY || process.env.POLY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found');
    process.exit(1);
  }

  // ============================================
  // 方式 1: 静态工厂方法（最简洁，推荐）
  // ============================================
  const sdk = await PolymarketSDK.create({ privateKey });
  // 一行搞定：new SDK + initialize + connect + waitForConnection

  // ============================================
  // 方式 2: 使用 start() 方法
  // ============================================
  // const sdk = new PolymarketSDK({ privateKey });
  // await sdk.start();  // initialize + connect + waitForConnection

  // ============================================
  // 方式 3: 手动分步（完全控制）
  // ============================================
  // const sdk = new PolymarketSDK({ privateKey });
  // await sdk.initialize();
  // sdk.connect();
  // await sdk.waitForConnection();

  console.log('✅ SDK ready\n');

  // 启动自动跟单
  const subscription = await sdk.smartMoney.startAutoCopyTrading({
    topN: TOP_N,
    sizeScale: 0.1,
    maxSizePerTrade: 10,
    maxSlippage: 0.03,
    orderType: 'FOK',
    minTradeSize: 5,
    dryRun: DRY_RUN,
    onTrade: (trade, result) => {
      console.log(`📈 ${trade.traderName || trade.traderAddress.slice(0, 10)}...`);
      console.log(`   ${trade.side} ${trade.outcome} @ $${trade.price.toFixed(4)}`);
      console.log(`   ${result.success ? '✅' : '❌'}\n`);
    },
  });

  console.log(`跟踪 ${subscription.targetAddresses.length} 个钱包`);
  console.log('⏳ 监听中...\n');

  // 运行指定时间
  await new Promise(resolve => setTimeout(resolve, RUN_DURATION_MS));

  // 统计
  const stats = subscription.getStats();
  console.log('='.repeat(60));
  console.log(`检测: ${stats.tradesDetected}, 执行: ${stats.tradesExecuted}, 跳过: ${stats.tradesSkipped}`);

  // 清理 - 一行搞定
  subscription.stop();
  sdk.stop();  // 或 sdk.disconnect()

  console.log('✅ Done');
}

main().catch(console.error);

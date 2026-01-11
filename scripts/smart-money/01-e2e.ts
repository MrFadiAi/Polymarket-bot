/**
 * TRUE E2E Test: SmartMoneyService 完整链路验证
 *
 * 按照 true-e2e-verification skill:
 * 1. 使用 SmartMoneyService.subscribeSmartMoneyTrades() 监听信号
 * 2. 使用 SmartMoneyService.executeCopyTrade() 执行跟单
 * 3. 通过 createMarketOrder 返回值直接判断成功 (最快方式)
 *
 * 运行：pnpm exec tsx scripts/smart-money/01-e2e.ts
 */

import 'dotenv/config';
import {
  SmartMoneyService,
  WalletService,
  RealtimeServiceV2,
  TradingService,
  DataApiClient,
  SubgraphClient,
  RateLimiter,
  createUnifiedCache,
  type SmartMoneyTrade,
  type TradingSignal,
} from '../../src/index.js';

// Test configuration
const TEST_AMOUNT_USDC = 2; // $2 minimum
const TIMEOUT_MS = 60_000;

async function main() {
  console.log('='.repeat(60));
  console.log('TRUE E2E Test: SmartMoneyService 完整链路');
  console.log('='.repeat(60));

  // Check for private key
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  // Initialize all services
  console.log('\n[Init] 初始化服务...');
  const cache = createUnifiedCache();
  const rateLimiter = new RateLimiter();
  const dataApi = new DataApiClient(rateLimiter, cache);
  const subgraph = new SubgraphClient(rateLimiter, cache);
  const walletService = new WalletService(dataApi, subgraph, cache);
  const realtimeService = new RealtimeServiceV2();
  const tradingService = new TradingService(rateLimiter, cache, {
    privateKey: process.env.PRIVATE_KEY,
    chainId: 137,
  });

  const smartMoneyService = new SmartMoneyService(
    walletService,
    realtimeService,
    tradingService
  );

  const ourAddress = tradingService.getAddress().toLowerCase();
  console.log(`  我们的钱包: ${ourAddress.slice(0, 10)}...${ourAddress.slice(-6)}`);

  try {
    // Step 1: Connect WebSocket
    console.log('\n[Step 1] 连接 WebSocket...');
    realtimeService.connect();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
      realtimeService.once('connected', () => {
        clearTimeout(timeout);
        console.log('  ✅ WebSocket connected');
        resolve();
      });
    });

    // Step 2: Subscribe to Smart Money trades and wait for signal
    console.log('\n[Step 2] 使用 SmartMoneyService.subscribeSmartMoneyTrades() 监听...');
    console.log('  等待交易信号...\n');

    let tradeCount = 0;
    const signalTrade = await new Promise<SmartMoneyTrade>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`Timeout waiting for signal. Received ${tradeCount} trades but none matched.`));
      }, TIMEOUT_MS);

      const subscription = smartMoneyService.subscribeSmartMoneyTrades(
        (trade: SmartMoneyTrade) => {
          tradeCount++;

          // Skip our own trades (though WebSocket won't show them anyway)
          if (trade.traderAddress.toLowerCase() === ourAddress) {
            console.log(`  [${tradeCount}] Skipping our own trade`);
            return;
          }

          // Skip very small trades
          if (trade.size < 2) {
            if (tradeCount <= 3) {
              console.log(`  [${tradeCount}] Trade too small: ${trade.size}`);
            }
            return;
          }

          // Found a signal!
          console.log(`  📡 [${tradeCount}] 收到 SmartMoneyTrade:`);
          console.log(`    Trader: ${trade.traderName || trade.traderAddress.slice(0, 10)}...`);
          console.log(`    Market: ${trade.marketSlug}`);
          console.log(`    Side: ${trade.side} ${trade.outcome}`);
          console.log(`    Size: ${trade.size} @ $${trade.price.toFixed(4)}`);
          console.log(`    TokenId: ${trade.tokenId?.slice(0, 20)}...`);
          console.log(`    isSmartMoney: ${trade.isSmartMoney}`);

          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(trade);
        },
        { minSize: 1 } // Lower threshold
      );
    });

    // Step 3: Convert SmartMoneyTrade to TradingSignal
    console.log('\n[Step 3] 转换为 TradingSignal...');

    const signal: TradingSignal = {
      type: 'buy',
      confidence: 0.8,
      conditionId: signalTrade.conditionId,
      marketSlug: signalTrade.marketSlug,
      side: signalTrade.side,
      outcome: (signalTrade.outcome as 'YES' | 'NO') || 'YES',
      suggestedPrice: signalTrade.price,
      suggestedSize: TEST_AMOUNT_USDC / signalTrade.price,
      reasons: [`Following ${signalTrade.traderName || signalTrade.traderAddress.slice(0, 10)}...`],
      contributingTrades: [signalTrade],
      timestamp: Date.now(),
    };

    console.log('  Signal created:');
    console.log(`    type: ${signal.type}`);
    console.log(`    side: ${signal.side} ${signal.outcome}`);
    console.log(`    price: $${signal.suggestedPrice?.toFixed(4)}`);

    // Step 4: Execute copy trade
    console.log('\n[Step 4] 使用 SmartMoneyService.executeCopyTrade() 跟单...');
    console.log(`  Amount: $${TEST_AMOUNT_USDC}`);

    const t0 = Date.now();

    const result = await smartMoneyService.executeCopyTrade(signal, {
      sizeScale: 1, // Use full signal size
      maxSize: TEST_AMOUNT_USDC,
      maxSlippage: 0.05, // 5%
      executionMode: 'market',
      marketOrderType: 'FAK', // Allow partial fills
    });

    const executionTime = Date.now() - t0;

    // Step 5: Check result (最快验证方式 - 直接看返回值)
    console.log('\n[Step 5] 验证结果 (通过返回值直接判断)...');
    console.log('='.repeat(60));
    console.log('E2E 测试结果');
    console.log('='.repeat(60));

    if (result.success) {
      console.log('\n✅ 跟单成功!');
      console.log('\n📊 订单详情:');
      console.log(`  OrderId: ${result.orderId}`);
      if (result.transactionHashes?.length) {
        console.log(`  TxHash: ${result.transactionHashes[0]}`);
        console.log(`  (有 TxHash = 已上链成交)`);
      }
      console.log(`\n⏱️ 执行耗时: ${executionTime}ms`);
    } else {
      console.log('\n❌ 跟单失败');
      console.log(`  Error: ${result.errorMsg}`);
    }

    console.log('\n📝 验证方式说明:');
    console.log('  - createMarketOrder 返回 success + transactionHashes = 已成交');
    console.log('  - 这是最快的验证方式 (0ms 额外延迟)');
    console.log('  - 不需要调用 getTrades() 或等待 WebSocket');

    // Cleanup
    smartMoneyService.disconnect();
    realtimeService.disconnect();

    console.log('\n' + '='.repeat(60));
    console.log('测试完成');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    smartMoneyService.disconnect();
    realtimeService.disconnect();
    process.exit(1);
  }
}

main().catch(console.error);

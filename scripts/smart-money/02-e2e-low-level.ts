/**
 * TRUE E2E Test: Copy Trading 完整链路验证
 *
 * 按照 true-e2e-verification skill 的要求：
 * 1. 主动触发 + 被动监听
 * 2. 测量完整链路延迟（下单 → WebSocket 收到）
 *
 * 流程：
 * 1. 连接 Activity WebSocket
 * 2. 等待一个 Smart Money 交易信号
 * 3. 跟单下一个小额订单 ($2 minimum)
 * 4. 验证我们的订单是否在 Activity WebSocket 中收到
 * 5. 测量完整延迟
 *
 * 运行：pnpm exec tsx scripts/smart-money/02-e2e-low-level.ts
 */

import 'dotenv/config';
import {
  RealtimeServiceV2,
  TradingService,
  RateLimiter,
  createUnifiedCache,
  type ActivityTrade,
} from '../../src/index.js';

// Test configuration
const TEST_AMOUNT = 2; // $2 minimum order
const TIMEOUT_MS = 60_000; // 1 minute to find a signal and execute

interface E2EResult {
  signalTrade: ActivityTrade | null;
  ourOrderId: string | null;
  ourOrderPlacedAt: number;
  ourOrderReceivedAt: number | null;
  roundTripLatency: number | null;
  success: boolean;
  error?: string;
}

async function main() {
  console.log('='.repeat(60));
  console.log('TRUE E2E Test: Copy Trading 完整链路验证');
  console.log('='.repeat(60));
  console.log('\n按照 true-e2e-verification skill:');
  console.log('  1. 主动触发（下单）+ 被动监听（WebSocket）');
  console.log('  2. 测量完整链路延迟\n');

  // Check for private key
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  const result: E2EResult = {
    signalTrade: null,
    ourOrderId: null,
    ourOrderPlacedAt: 0,
    ourOrderReceivedAt: null,
    roundTripLatency: null,
    success: false,
  };

  // Initialize services
  const cache = createUnifiedCache();
  const rateLimiter = new RateLimiter();
  const realtime = new RealtimeServiceV2();
  const trading = new TradingService(rateLimiter, cache, {
    privateKey: process.env.PRIVATE_KEY,
    chainId: 137,
  });

  try {
    // Step 1: Connect WebSocket
    console.log('[Step 1] 连接 Activity WebSocket...');
    realtime.connect();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
      realtime.once('connected', () => {
        clearTimeout(timeout);
        console.log('  ✅ WebSocket connected\n');
        resolve();
      });
    });

    // Get our wallet address
    const ourAddress = trading.getAddress().toLowerCase();
    console.log(`[Info] 我们的钱包地址: ${ourAddress.slice(0, 10)}...${ourAddress.slice(-6)}\n`);

    // Step 2: Wait for a signal trade
    console.log('[Step 2] 等待 Smart Money 交易信号...');
    console.log('  (监听所有交易，选择第一个有足够流动性的市场)\n');

    const signalTrade = await new Promise<ActivityTrade>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for signal trade'));
      }, TIMEOUT_MS);

      const sub = realtime.subscribeAllActivity({
        onTrade: (trade) => {
          // Skip our own trades
          if (trade.trader?.address?.toLowerCase() === ourAddress) return;

          // Skip tiny trades
          if (trade.size < 10) return;

          // Found a signal!
          console.log('  📡 收到信号交易:');
          console.log(`    Trader: ${trade.trader?.name || trade.trader?.address?.slice(0, 10)}...`);
          console.log(`    Market: ${trade.marketSlug}`);
          console.log(`    Side: ${trade.side} ${trade.outcome}`);
          console.log(`    Size: ${trade.size} @ $${trade.price.toFixed(4)}`);
          console.log(`    Token: ${trade.asset.slice(0, 20)}...`);

          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(trade);
        },
      });
    });

    result.signalTrade = signalTrade;

    // Step 3: Place our order (copy the signal)
    console.log('\n[Step 3] 跟单下单...');
    console.log(`  Market: ${signalTrade.marketSlug}`);
    console.log(`  Side: ${signalTrade.side} ${signalTrade.outcome}`);
    console.log(`  Amount: $${TEST_AMOUNT}`);

    // Record the time BEFORE placing order
    result.ourOrderPlacedAt = Date.now();

    try {
      // Place a market order following the signal
      // Use FAK (Fill and Kill) for partial fills
      const orderResult = await trading.createMarketOrder({
        tokenId: signalTrade.asset,
        side: signalTrade.side,
        amount: TEST_AMOUNT,
        orderType: 'FAK', // Allow partial fills
      });

      if (orderResult.success) {
        result.ourOrderId = orderResult.orderId || orderResult.orderIds?.[0];
        console.log(`  ✅ 订单已提交: ${result.ourOrderId}`);
        if (orderResult.transactionHashes?.length) {
          console.log(`  TxHash: ${orderResult.transactionHashes[0]}`);
        }
      } else {
        throw new Error(orderResult.errorMsg || 'Unknown error');
      }

    } catch (orderError: any) {
      console.log(`  ⚠️ 下单失败: ${orderError.message}`);
      result.error = orderError.message;

      // Even if order fails, we can still check if the concept works
      // Try with a limit order instead
      console.log('\n  尝试使用限价单...');

      try {
        const limitResult = await trading.createLimitOrder({
          tokenId: signalTrade.asset,
          side: signalTrade.side,
          price: signalTrade.price,
          size: TEST_AMOUNT / signalTrade.price,
          orderType: 'GTC',
        });

        result.ourOrderId = limitResult.orderId;
        console.log(`  ✅ 限价单已提交: ${limitResult.orderId}`);

      } catch (limitError: any) {
        console.log(`  ❌ 限价单也失败: ${limitError.message}`);
        result.error = limitError.message;
      }
    }

    // Step 4: Verify trade via API (since Activity WebSocket doesn't show our own trades)
    console.log('\n[Step 4] 通过 API 验证交易执行...');
    console.log('  (注意: Activity WebSocket 不会广播我们自己的交易)\n');

    // Wait a moment for trade to settle
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check trades via API
    const trades = await trading.getTrades();
    const ourTrade = trades.find(t =>
      t.tokenId === signalTrade.asset &&
      t.side === signalTrade.side
    );

    // Results
    console.log('='.repeat(60));
    console.log('E2E 测试结果');
    console.log('='.repeat(60));

    if (ourTrade) {
      const tradeTime = ourTrade.timestamp * 1000;
      const executionLatency = tradeTime - result.ourOrderPlacedAt;

      console.log(`\n✅ 跟单交易执行成功!`);
      console.log(`\n📊 交易详情:`);
      console.log(`  Side: ${ourTrade.side}`);
      console.log(`  Price: $${ourTrade.price}`);
      console.log(`  Size: ${ourTrade.size} shares`);
      console.log(`  Fee: $${ourTrade.fee}`);
      console.log(`\n⏱️ 延迟测量:`);
      console.log(`  下单时间: ${new Date(result.ourOrderPlacedAt).toISOString()}`);
      console.log(`  成交时间: ${new Date(tradeTime).toISOString()}`);
      console.log(`  执行延迟: ${executionLatency}ms`);

      result.success = true;
      result.roundTripLatency = executionLatency;
    } else {
      console.log(`\n⚠️ 未找到我们的交易`);
      console.log(`  可能原因:`);
      console.log(`  - 订单未成交 (市场深度不足)`);
      console.log(`  - FAK 订单被取消`);

      if (result.error) {
        console.log(`  - 错误: ${result.error}`);
      }
    }

    console.log(`\n📝 发现:`);
    console.log(`  Activity WebSocket 不会广播用户自己的交易`);
    console.log(`  需要通过 getTrades() API 验证自己的交易执行`);
    console.log(`  或使用 clob_user topic (需要认证) 监听自己的交易`);

    // Cleanup
    realtime.disconnect();

    console.log('\n' + '='.repeat(60));
    console.log('测试完成');
    console.log('='.repeat(60));

    return result;

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    realtime.disconnect();
    process.exit(1);
  }
}

main().catch(console.error);

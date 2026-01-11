#!/usr/bin/env npx tsx
/**
 * Order Latency Benchmark
 *
 * 测试在 Polymarket API 的延迟
 *
 * 测量指标：
 * - 订单簿获取延迟
 * - 市场数据获取延迟
 * - 下单延迟（如果配置了 API Key）
 *
 * Usage:
 *   npx tsx scripts/benchmark/order-latency.ts
 *   npx tsx scripts/benchmark/order-latency.ts --rounds 10
 */

import { PolymarketSDK } from '../../src/index.js';

// ========================================
// Configuration
// ========================================

const ROUNDS = parseInt(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || '5');
const DRY_RUN = process.argv.includes('--dry-run');

interface LatencyResult {
  operation: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           Order Latency Benchmark                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Rounds:    ${ROUNDS}                                              ║`);
  console.log(`║  Dry Run:   ${DRY_RUN ? 'YES (no actual orders)' : 'NO (will place real orders)'}              ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const sdk = new PolymarketSDK();
  const results: LatencyResult[] = [];

  // Find an active market
  console.log('🔍 Finding active market...');
  const markets = await sdk.dipArb.scanUpcomingMarkets({
    coin: 'BTC',
    duration: '15m',
    minMinutesUntilEnd: 5,
    maxMinutesUntilEnd: 30,
    limit: 1,
  });

  if (markets.length === 0) {
    console.log('❌ No active markets found. Try again later.');
    process.exit(1);
  }

  const market = markets[0];
  console.log(`✅ Found: ${market.name}`);
  console.log(`   Condition: ${market.conditionId.slice(0, 20)}...`);
  console.log('');

  // Benchmark 1: Get Processed Orderbook (includes analytics)
  console.log('📊 Benchmark 1: Get Processed Orderbook Latency');
  console.log('───────────────────────────────────────────────');

  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    try {
      await sdk.getOrderbook(market.conditionId);
      const latency = performance.now() - start;
      results.push({ operation: 'getOrderbook', latencyMs: latency, success: true });
      console.log(`   Round ${i + 1}: ${latency.toFixed(2)}ms`);
    } catch (error) {
      const latency = performance.now() - start;
      results.push({
        operation: 'getOrderbook',
        latencyMs: latency,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`   Round ${i + 1}: FAILED - ${error instanceof Error ? error.message : String(error)}`);
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('');

  // Benchmark 2: Get Market Data
  console.log('📊 Benchmark 2: Get Market Data Latency');
  console.log('───────────────────────────────────────');

  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    try {
      await sdk.getMarket(market.conditionId);
      const latency = performance.now() - start;
      results.push({ operation: 'getMarket', latencyMs: latency, success: true });
      console.log(`   Round ${i + 1}: ${latency.toFixed(2)}ms`);
    } catch (error) {
      const latency = performance.now() - start;
      results.push({
        operation: 'getMarket',
        latencyMs: latency,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`   Round ${i + 1}: FAILED - ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('');

  // Benchmark 3: Detect Arbitrage (includes orderbook fetch + calculations)
  console.log('📊 Benchmark 3: Detect Arbitrage Latency');
  console.log('────────────────────────────────────────');

  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    try {
      await sdk.detectArbitrage(market.conditionId);
      const latency = performance.now() - start;
      results.push({ operation: 'detectArbitrage', latencyMs: latency, success: true });
      console.log(`   Round ${i + 1}: ${latency.toFixed(2)}ms`);
    } catch (error) {
      const latency = performance.now() - start;
      results.push({
        operation: 'detectArbitrage',
        latencyMs: latency,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`   Round ${i + 1}: FAILED - ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('');

  // Benchmark 4: Place and Cancel Order (if not dry run and has trading service)
  const tradingService = (sdk as any).tradingService;
  if (!DRY_RUN && tradingService) {
    console.log('📊 Benchmark 4: Place & Cancel Order Latency');
    console.log('─────────────────────────────────────────────');

    try {
      await tradingService.initialize();
    } catch (error) {
      console.log(`⚠️  Trading service not available: ${error instanceof Error ? error.message : String(error)}`);
      console.log('   Skipping order placement tests.');
      console.log('');
    }

    if (tradingService.isInitialized?.()) {
      // Use a very low price that won't fill
      const testPrice = 0.01;
      const testSize = 10;

      for (let i = 0; i < Math.min(ROUNDS, 3); i++) {
        // Place order
        const placeStart = performance.now();
        try {
          const orderResult = await tradingService.createLimitOrder({
            tokenId: market.upTokenId,
            side: 'BUY',
            price: testPrice,
            size: testSize,
          });
          const placeLatency = performance.now() - placeStart;
          results.push({ operation: 'createLimitOrder', latencyMs: placeLatency, success: orderResult.success });
          console.log(`   Round ${i + 1} Place: ${placeLatency.toFixed(2)}ms`);

          // Cancel order
          if (orderResult.success && orderResult.orderId) {
            await new Promise(r => setTimeout(r, 500));
            const cancelStart = performance.now();
            await tradingService.cancelOrder(orderResult.orderId);
            const cancelLatency = performance.now() - cancelStart;
            results.push({ operation: 'cancelOrder', latencyMs: cancelLatency, success: true });
            console.log(`   Round ${i + 1} Cancel: ${cancelLatency.toFixed(2)}ms`);
          }
        } catch (error) {
          const latency = performance.now() - placeStart;
          results.push({
            operation: 'createLimitOrder',
            latencyMs: latency,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          console.log(`   Round ${i + 1}: FAILED - ${error instanceof Error ? error.message : String(error)}`);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log('');
    }
  } else {
    console.log('⏭️  Skipping order placement (dry run mode or no trading service)');
    console.log('');
  }

  // Calculate statistics
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                      RESULTS                              ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const calcStats = (arr: number[]) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
    };
  };

  const operations = ['getOrderbook', 'getMarket', 'detectArbitrage', 'createLimitOrder', 'cancelOrder'];

  for (const op of operations) {
    const opResults = results.filter(r => r.operation === op && r.success);
    if (opResults.length === 0) continue;

    const latencies = opResults.map(r => r.latencyMs);
    const stats = calcStats(latencies);
    if (!stats) continue;

    console.log(`📈 ${op}:`);
    console.log(`   Samples:  ${opResults.length}`);
    console.log(`   Min:      ${stats.min.toFixed(2)}ms`);
    console.log(`   Max:      ${stats.max.toFixed(2)}ms`);
    console.log(`   Avg:      ${stats.avg.toFixed(2)}ms`);
    console.log(`   P50:      ${stats.p50.toFixed(2)}ms`);
    console.log(`   P95:      ${stats.p95.toFixed(2)}ms`);
    console.log('');
  }

  // Output JSON for comparison
  const summary: Record<string, any> = {
    timestamp: new Date().toISOString(),
    rounds: ROUNDS,
    dryRun: DRY_RUN,
    market: market.slug,
  };

  for (const op of operations) {
    const opResults = results.filter(r => r.operation === op && r.success);
    if (opResults.length === 0) continue;
    const latencies = opResults.map(r => r.latencyMs);
    summary[op] = calcStats(latencies);
  }

  console.log('📄 JSON Result:');
  console.log(JSON.stringify(summary, null, 2));

  sdk.stop();
}

main().catch(console.error);

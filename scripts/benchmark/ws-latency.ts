#!/usr/bin/env npx tsx
/**
 * WebSocket Latency Benchmark
 *
 * 测试从 Polymarket WebSocket 接收 orderbook 更新的延迟
 *
 * 测量指标：
 * - 消息间隔时间 (message interval)
 * - 首次消息延迟 (time to first message)
 * - 消息处理时间 (processing time)
 *
 * Usage:
 *   npx tsx scripts/benchmark/ws-latency.ts
 *   npx tsx scripts/benchmark/ws-latency.ts --duration 60  # 运行60秒
 */

import { PolymarketSDK } from '../../src/index.js';

// ========================================
// Configuration
// ========================================

const DURATION_SECONDS = parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] || '30');
const SAMPLE_MARKET = 'btc-updown-15m';  // 使用活跃的 15 分钟市场

interface LatencyStats {
  messageCount: number;
  intervals: number[];
  processingTimes: number[];
  firstMessageTime: number | null;
  connectionTime: number | null;
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         WebSocket Latency Benchmark                      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Duration: ${DURATION_SECONDS}s                                           ║`);
  console.log(`║  Market:   ${SAMPLE_MARKET}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const sdk = new PolymarketSDK();

  const stats: LatencyStats = {
    messageCount: 0,
    intervals: [],
    processingTimes: [],
    firstMessageTime: null,
    connectionTime: null,
  };

  let lastMessageTime = 0;
  const startTime = Date.now();

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
  console.log(`   UP Token: ${market.upTokenId.slice(0, 20)}...`);
  console.log(`   DOWN Token: ${market.downTokenId.slice(0, 20)}...`);
  console.log('');

  // Connect and subscribe
  console.log('📡 Connecting to WebSocket...');
  const connectStart = Date.now();

  const realtimeService = (sdk as any).realtimeService;
  realtimeService.connect();

  await new Promise<void>((resolve) => {
    realtimeService.once('connected', () => {
      stats.connectionTime = Date.now() - connectStart;
      console.log(`✅ Connected in ${stats.connectionTime}ms`);
      resolve();
    });

    setTimeout(() => {
      console.log('⚠️ Connection timeout, proceeding anyway');
      resolve();
    }, 10000);
  });

  // Subscribe to orderbook
  console.log('📊 Subscribing to orderbook...');
  console.log('');
  console.log('Collecting samples...');

  const subscription = realtimeService.subscribeMarkets(
    [market.upTokenId, market.downTokenId],
    {
      onOrderbook: () => {
        const now = Date.now();
        const processStart = performance.now();

        stats.messageCount++;

        if (stats.firstMessageTime === null) {
          stats.firstMessageTime = now - startTime;
          console.log(`   First message received in ${stats.firstMessageTime}ms`);
        }

        if (lastMessageTime > 0) {
          const interval = now - lastMessageTime;
          stats.intervals.push(interval);
        }

        lastMessageTime = now;

        // Simulate some processing
        const processEnd = performance.now();
        stats.processingTimes.push(processEnd - processStart);

        // Progress indicator
        if (stats.messageCount % 100 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`   ${stats.messageCount} messages received (${elapsed}s elapsed)`);
        }
      },
      onError: (error: Error) => {
        console.error('WebSocket error:', error.message);
      },
    }
  );

  // Wait for duration
  await new Promise(resolve => setTimeout(resolve, DURATION_SECONDS * 1000));

  // Cleanup
  subscription.unsubscribe();
  sdk.stop();

  // Calculate statistics
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                      RESULTS                              ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const calcStats = (arr: number[]) => {
    if (arr.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  };

  const intervalStats = calcStats(stats.intervals);
  const processingStats = calcStats(stats.processingTimes);

  console.log('📈 Message Statistics:');
  console.log(`   Total messages:     ${stats.messageCount}`);
  console.log(`   Messages per second: ${(stats.messageCount / DURATION_SECONDS).toFixed(2)}`);
  console.log(`   Connection time:    ${stats.connectionTime}ms`);
  console.log(`   First message:      ${stats.firstMessageTime}ms`);
  console.log('');

  console.log('⏱️  Message Interval (ms):');
  console.log(`   Min:    ${intervalStats.min.toFixed(2)}`);
  console.log(`   Max:    ${intervalStats.max.toFixed(2)}`);
  console.log(`   Avg:    ${intervalStats.avg.toFixed(2)}`);
  console.log(`   P50:    ${intervalStats.p50.toFixed(2)}`);
  console.log(`   P95:    ${intervalStats.p95.toFixed(2)}`);
  console.log(`   P99:    ${intervalStats.p99.toFixed(2)}`);
  console.log('');

  console.log('⚡ Processing Time (ms):');
  console.log(`   Min:    ${processingStats.min.toFixed(4)}`);
  console.log(`   Max:    ${processingStats.max.toFixed(4)}`);
  console.log(`   Avg:    ${processingStats.avg.toFixed(4)}`);
  console.log('');

  // Output JSON for comparison
  const result = {
    timestamp: new Date().toISOString(),
    duration: DURATION_SECONDS,
    market: market.slug,
    connection: {
      timeMs: stats.connectionTime,
      firstMessageMs: stats.firstMessageTime,
    },
    messages: {
      total: stats.messageCount,
      perSecond: stats.messageCount / DURATION_SECONDS,
    },
    interval: intervalStats,
    processing: processingStats,
  };

  console.log('📄 JSON Result:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);

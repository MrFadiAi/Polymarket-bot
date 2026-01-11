#!/usr/bin/env npx tsx
/**
 * RPC Latency Benchmark
 *
 * 测试 Polygon RPC 节点的延迟
 *
 * 测量指标：
 * - 获取区块号延迟
 * - 获取余额延迟
 * - 不同 RPC 端点的对比
 *
 * Usage:
 *   npx tsx scripts/benchmark/rpc-latency.ts
 *   npx tsx scripts/benchmark/rpc-latency.ts --rounds 10
 */

// ========================================
// Configuration
// ========================================

const ROUNDS = parseInt(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || '5');

// Common RPC endpoints to test
const RPC_ENDPOINTS = [
  { name: 'Polygon Public', url: 'https://polygon-rpc.com' },
  { name: 'Ankr', url: 'https://rpc.ankr.com/polygon' },
  { name: 'Alchemy', url: process.env.POLYGON_RPC_URL || '' },
].filter(e => e.url);

// Test wallet address (Polymarket Exchange)
const TEST_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

interface RpcResult {
  endpoint: string;
  operation: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

// ========================================
// RPC Helper
// ========================================

async function rpcCall(url: string, method: string, params: any[]): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'RPC error');
  }
  return data.result;
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           RPC Latency Benchmark                          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Rounds:     ${ROUNDS}                                             ║`);
  console.log(`║  Endpoints:  ${RPC_ENDPOINTS.length}                                             ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const results: RpcResult[] = [];

  for (const endpoint of RPC_ENDPOINTS) {
    console.log(`📡 Testing: ${endpoint.name}`);
    console.log(`   URL: ${endpoint.url.slice(0, 40)}...`);
    console.log('─────────────────────────────────────────');

    // Test 1: Get Block Number
    console.log('   📊 eth_blockNumber:');
    for (let i = 0; i < ROUNDS; i++) {
      const start = performance.now();
      try {
        await rpcCall(endpoint.url, 'eth_blockNumber', []);
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_blockNumber',
          latencyMs: latency,
          success: true,
        });
        console.log(`      Round ${i + 1}: ${latency.toFixed(2)}ms`);
      } catch (error) {
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_blockNumber',
          latencyMs: latency,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`      Round ${i + 1}: FAILED`);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Test 2: Get Balance
    console.log('   📊 eth_getBalance:');
    for (let i = 0; i < ROUNDS; i++) {
      const start = performance.now();
      try {
        const balance = await rpcCall(endpoint.url, 'eth_getBalance', [TEST_ADDRESS, 'latest']);
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_getBalance',
          latencyMs: latency,
          success: true,
        });
        if (i === 0) {
          const balanceEth = parseInt(balance, 16) / 1e18;
          console.log(`      Balance: ${balanceEth.toFixed(4)} MATIC`);
        }
        console.log(`      Round ${i + 1}: ${latency.toFixed(2)}ms`);
      } catch (error) {
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_getBalance',
          latencyMs: latency,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`      Round ${i + 1}: FAILED`);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Test 3: Get Gas Price
    console.log('   📊 eth_gasPrice:');
    for (let i = 0; i < ROUNDS; i++) {
      const start = performance.now();
      try {
        const gasPrice = await rpcCall(endpoint.url, 'eth_gasPrice', []);
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_gasPrice',
          latencyMs: latency,
          success: true,
        });
        if (i === 0) {
          const gasPriceGwei = parseInt(gasPrice, 16) / 1e9;
          console.log(`      Gas Price: ${gasPriceGwei.toFixed(2)} Gwei`);
        }
        console.log(`      Round ${i + 1}: ${latency.toFixed(2)}ms`);
      } catch (error) {
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_gasPrice',
          latencyMs: latency,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`      Round ${i + 1}: FAILED`);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Test 4: Get Latest Block
    console.log('   📊 eth_getBlockByNumber:');
    for (let i = 0; i < ROUNDS; i++) {
      const start = performance.now();
      try {
        await rpcCall(endpoint.url, 'eth_getBlockByNumber', ['latest', false]);
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_getBlockByNumber',
          latencyMs: latency,
          success: true,
        });
        console.log(`      Round ${i + 1}: ${latency.toFixed(2)}ms`);
      } catch (error) {
        const latency = performance.now() - start;
        results.push({
          endpoint: endpoint.name,
          operation: 'eth_getBlockByNumber',
          latencyMs: latency,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`      Round ${i + 1}: FAILED`);
      }
      await new Promise(r => setTimeout(r, 100));
    }

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

  // Summary by endpoint
  const summary: Record<string, Record<string, ReturnType<typeof calcStats>>> = {};

  for (const endpoint of RPC_ENDPOINTS) {
    summary[endpoint.name] = {};
    const operations = ['eth_blockNumber', 'eth_getBalance', 'eth_gasPrice', 'eth_getBlockByNumber'];

    console.log(`📈 ${endpoint.name}:`);

    for (const op of operations) {
      const opResults = results.filter(r =>
        r.endpoint === endpoint.name &&
        r.operation === op &&
        r.success
      );
      if (opResults.length === 0) {
        console.log(`   ${op}: No successful results`);
        continue;
      }

      const latencies = opResults.map(r => r.latencyMs);
      const stats = calcStats(latencies);
      if (!stats) continue;

      summary[endpoint.name][op] = stats;
      console.log(`   ${op}:`);
      console.log(`      Avg: ${stats.avg.toFixed(2)}ms | P50: ${stats.p50.toFixed(2)}ms | P95: ${stats.p95.toFixed(2)}ms`);
    }

    // Calculate overall average
    const allLatencies = results
      .filter(r => r.endpoint === endpoint.name && r.success)
      .map(r => r.latencyMs);
    const overallStats = calcStats(allLatencies);
    if (overallStats) {
      console.log(`   ─────────────────────────────────`);
      console.log(`   Overall Avg: ${overallStats.avg.toFixed(2)}ms`);
    }
    console.log('');
  }

  // Comparison table
  console.log('📊 Comparison (Average Latency):');
  console.log('┌────────────────────┬────────────────┬────────────────┬────────────────┬────────────────┐');
  console.log('│ Endpoint           │ blockNumber    │ getBalance     │ gasPrice       │ getBlock       │');
  console.log('├────────────────────┼────────────────┼────────────────┼────────────────┼────────────────┤');

  for (const endpoint of RPC_ENDPOINTS) {
    const ops = ['eth_blockNumber', 'eth_getBalance', 'eth_gasPrice', 'eth_getBlockByNumber'];
    const values = ops.map(op => {
      const stats = summary[endpoint.name]?.[op];
      return stats ? `${stats.avg.toFixed(0)}ms`.padStart(12) : '         N/A';
    });
    console.log(`│ ${endpoint.name.padEnd(18)} │${values.join(' │')} │`);
  }
  console.log('└────────────────────┴────────────────┴────────────────┴────────────────┴────────────────┘');
  console.log('');

  // Output JSON for comparison
  const jsonResult = {
    timestamp: new Date().toISOString(),
    rounds: ROUNDS,
    endpoints: RPC_ENDPOINTS.map(e => ({
      name: e.name,
      url: e.url.replace(/[a-zA-Z0-9]{20,}/g, '***'), // Hide API keys
      stats: summary[e.name],
    })),
  };

  console.log('📄 JSON Result:');
  console.log(JSON.stringify(jsonResult, null, 2));
}

main().catch(console.error);

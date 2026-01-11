#!/usr/bin/env npx tsx
/**
 * Compare Benchmark Results
 *
 * 比较不同服务器/时间的 benchmark 结果
 *
 * Usage:
 *   npx tsx scripts/benchmark/compare.ts result1.json result2.json
 *   npx tsx scripts/benchmark/compare.ts ./local.json ./vultr.json ./aws.json
 */

import * as fs from 'fs';

interface BenchmarkReport {
  timestamp: string;
  system: {
    platform: string;
    hostname: string;
    cpuModel: string;
    memory: string;
  };
  totalDuration: number;
  benchmarks: Array<{
    name: string;
    success: boolean;
    duration: number;
    results: any;
  }>;
}

// ========================================
// Main
// ========================================

async function main() {
  const files = process.argv.slice(2);

  if (files.length < 2) {
    console.log('Usage: npx tsx compare.ts <result1.json> <result2.json> [result3.json ...]');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx compare.ts ./local.json ./vultr.json');
    process.exit(1);
  }

  const reports: Array<{ file: string; data: BenchmarkReport }> = [];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      reports.push({ file, data });
    } catch (error) {
      console.error(`Failed to parse ${file}:`, error);
      process.exit(1);
    }
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           Benchmark Comparison Report                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // System info comparison
  console.log('📋 Systems Compared:');
  console.log('─────────────────────────────────────────────────────────');

  for (const { file, data } of reports) {
    const sys = data.system;
    console.log(`   ${file}:`);
    console.log(`      Host:     ${sys.hostname || 'Unknown'}`);
    console.log(`      Platform: ${sys.platform || 'Unknown'}`);
    console.log(`      CPU:      ${sys.cpuModel || 'Unknown'}`);
    console.log(`      Memory:   ${sys.memory || 'Unknown'}`);
    console.log(`      Time:     ${data.timestamp}`);
    console.log('');
  }

  // WebSocket comparison
  console.log('📡 WebSocket Latency:');
  console.log('─────────────────────────────────────────────────────────');

  const wsHeaders = ['Metric', ...reports.map(r => r.data.system.hostname || r.file.slice(0, 15))];
  const wsMetrics = ['Connection (ms)', 'Msgs/sec', 'Interval P50 (ms)', 'Interval P95 (ms)'];

  // Build header
  console.log('┌' + '─'.repeat(20) + reports.map(() => '┬' + '─'.repeat(15)).join('') + '┐');
  console.log('│' + wsHeaders[0].padEnd(20) + reports.map((_, i) => '│' + wsHeaders[i + 1].padStart(14) + ' ').join('') + '│');
  console.log('├' + '─'.repeat(20) + reports.map(() => '┼' + '─'.repeat(15)).join('') + '┤');

  // Connection time
  const connTimes = reports.map(r => {
    const ws = r.data.benchmarks.find(b => b.name === 'ws-latency')?.results;
    return ws?.connection?.timeMs?.toFixed(0) || 'N/A';
  });
  console.log('│' + 'Connection (ms)'.padEnd(20) + connTimes.map(v => '│' + String(v).padStart(14) + ' ').join('') + '│');

  // Messages per second
  const msgRates = reports.map(r => {
    const ws = r.data.benchmarks.find(b => b.name === 'ws-latency')?.results;
    return ws?.messages?.perSecond?.toFixed(2) || 'N/A';
  });
  console.log('│' + 'Msgs/sec'.padEnd(20) + msgRates.map(v => '│' + String(v).padStart(14) + ' ').join('') + '│');

  // Interval P50
  const p50s = reports.map(r => {
    const ws = r.data.benchmarks.find(b => b.name === 'ws-latency')?.results;
    return ws?.interval?.p50?.toFixed(2) || 'N/A';
  });
  console.log('│' + 'Interval P50 (ms)'.padEnd(20) + p50s.map(v => '│' + String(v).padStart(14) + ' ').join('') + '│');

  // Interval P95
  const p95s = reports.map(r => {
    const ws = r.data.benchmarks.find(b => b.name === 'ws-latency')?.results;
    return ws?.interval?.p95?.toFixed(2) || 'N/A';
  });
  console.log('│' + 'Interval P95 (ms)'.padEnd(20) + p95s.map(v => '│' + String(v).padStart(14) + ' ').join('') + '│');

  console.log('└' + '─'.repeat(20) + reports.map(() => '┴' + '─'.repeat(15)).join('') + '┘');
  console.log('');

  // Order API comparison
  console.log('📊 Order API Latency (avg ms):');
  console.log('─────────────────────────────────────────────────────────');

  console.log('┌' + '─'.repeat(20) + reports.map(() => '┬' + '─'.repeat(15)).join('') + '┐');
  console.log('│' + 'Operation'.padEnd(20) + reports.map(r => '│' + (r.data.system.hostname || r.file.slice(0, 14)).padStart(14) + ' ').join('') + '│');
  console.log('├' + '─'.repeat(20) + reports.map(() => '┼' + '─'.repeat(15)).join('') + '┤');

  const orderOps = ['getOrderbook', 'getBestPrices', 'estimateExecution'];
  for (const op of orderOps) {
    const values = reports.map(r => {
      const order = r.data.benchmarks.find(b => b.name === 'order-latency')?.results;
      return order?.[op]?.avg?.toFixed(2) || 'N/A';
    });
    console.log('│' + op.padEnd(20) + values.map(v => '│' + String(v).padStart(14) + ' ').join('') + '│');
  }

  console.log('└' + '─'.repeat(20) + reports.map(() => '┴' + '─'.repeat(15)).join('') + '┘');
  console.log('');

  // RPC comparison
  console.log('🔗 RPC Latency (avg ms):');
  console.log('─────────────────────────────────────────────────────────');

  // Collect all unique RPC endpoints across all reports
  const allEndpoints = new Set<string>();
  for (const { data } of reports) {
    const rpc = data.benchmarks.find(b => b.name === 'rpc-latency')?.results;
    if (rpc?.endpoints) {
      for (const ep of rpc.endpoints) {
        allEndpoints.add(ep.name);
      }
    }
  }

  if (allEndpoints.size > 0) {
    console.log('┌' + '─'.repeat(20) + reports.map(() => '┬' + '─'.repeat(15)).join('') + '┐');
    console.log('│' + 'Endpoint'.padEnd(20) + reports.map(r => '│' + (r.data.system.hostname || r.file.slice(0, 14)).padStart(14) + ' ').join('') + '│');
    console.log('├' + '─'.repeat(20) + reports.map(() => '┼' + '─'.repeat(15)).join('') + '┤');

    for (const epName of Array.from(allEndpoints)) {
      const values = reports.map(r => {
        const rpc = r.data.benchmarks.find(b => b.name === 'rpc-latency')?.results;
        const ep = rpc?.endpoints?.find((e: any) => e.name === epName);
        return ep?.stats?.getBlockNumber?.avg?.toFixed(2) || 'N/A';
      });
      console.log('│' + epName.slice(0, 19).padEnd(20) + values.map(v => '│' + String(v).padStart(14) + ' ').join('') + '│');
    }

    console.log('└' + '─'.repeat(20) + reports.map(() => '┴' + '─'.repeat(15)).join('') + '┘');
  }
  console.log('');

  // Winner summary
  console.log('🏆 Summary:');
  console.log('─────────────────────────────────────────────────────────');

  // Find best WebSocket
  const wsScores = reports.map((r, i) => {
    const ws = r.data.benchmarks.find(b => b.name === 'ws-latency')?.results;
    const p50 = ws?.interval?.p50 ?? Infinity;
    return { index: i, p50, name: r.data.system.hostname || r.file };
  });
  wsScores.sort((a, b) => a.p50 - b.p50);

  if (wsScores[0].p50 !== Infinity) {
    console.log(`   Best WebSocket Latency:  ${wsScores[0].name} (P50: ${wsScores[0].p50.toFixed(2)}ms)`);
  }

  // Find best order API
  const orderScores = reports.map((r, i) => {
    const order = r.data.benchmarks.find(b => b.name === 'order-latency')?.results;
    const avg = order?.getOrderbook?.avg ?? Infinity;
    return { index: i, avg, name: r.data.system.hostname || r.file };
  });
  orderScores.sort((a, b) => a.avg - b.avg);

  if (orderScores[0].avg !== Infinity) {
    console.log(`   Best Order API Latency:  ${orderScores[0].name} (Avg: ${orderScores[0].avg.toFixed(2)}ms)`);
  }

  console.log('');
  console.log('💡 Lower latency = better for trading');
}

main().catch(console.error);

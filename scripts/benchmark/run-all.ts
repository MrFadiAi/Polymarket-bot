#!/usr/bin/env npx tsx
/**
 * Run All Benchmarks
 *
 * 运行所有 benchmark 脚本并生成汇总报告
 *
 * Usage:
 *   npx tsx scripts/benchmark/run-all.ts
 *   npx tsx scripts/benchmark/run-all.ts --output ./benchmark-results.json
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

// ========================================
// Configuration
// ========================================

const OUTPUT_FILE = process.argv.find(a => a.startsWith('--output='))?.split('=')[1];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_DIR = __dirname;

interface BenchmarkResult {
  name: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

// ========================================
// Helpers
// ========================================

function runScript(scriptPath: string, args: string[] = []): Promise<BenchmarkResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const name = path.basename(scriptPath, '.ts');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${name}`);
    console.log('='.repeat(60));

    const child = spawn('npx', ['tsx', scriptPath, ...args], {
      cwd: path.resolve(SCRIPT_DIR, '../..'),
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stdout.write(str);
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      errorOutput += str;
      process.stderr.write(str);
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        name,
        success: code === 0,
        duration,
        output: output || undefined,
        error: errorOutput || undefined,
      });
    });

    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        name,
        success: false,
        duration,
        error: err.message,
      });
    });
  });
}

function extractJsonFromOutput(output: string): object | null {
  // Find JSON block in output
  const jsonMatch = output.match(/\{[\s\S]*"timestamp"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

interface SystemInfo {
  platform: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  memory: string;
  hostname: string;
  nodeVersion: string;
}

function getSystemInfo(): SystemInfo {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
    hostname: os.hostname(),
    nodeVersion: process.version,
  };
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           Polymarket SDK Benchmark Suite                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const systemInfo = getSystemInfo();
  console.log('📋 System Info:');
  console.log(`   Platform:  ${systemInfo.platform} ${systemInfo.arch}`);
  console.log(`   CPU:       ${systemInfo.cpuModel}`);
  console.log(`   Cores:     ${systemInfo.cpus}`);
  console.log(`   Memory:    ${systemInfo.memory}`);
  console.log(`   Node:      ${systemInfo.nodeVersion}`);

  const benchmarks = [
    { script: 'ws-latency.ts', args: ['--duration=15'] },
    { script: 'order-latency.ts', args: ['--rounds=3', '--dry-run'] },
    { script: 'rpc-latency.ts', args: ['--rounds=3'] },
  ];

  const results: BenchmarkResult[] = [];
  const extractedResults: Record<string, object | null> = {};

  const startTime = Date.now();

  for (const benchmark of benchmarks) {
    const scriptPath = path.join(SCRIPT_DIR, benchmark.script);

    if (!fs.existsSync(scriptPath)) {
      console.log(`\n⚠️ Script not found: ${benchmark.script}`);
      results.push({
        name: benchmark.script,
        success: false,
        duration: 0,
        error: 'Script not found',
      });
      continue;
    }

    const result = await runScript(scriptPath, benchmark.args);
    results.push(result);

    if (result.output) {
      extractedResults[result.name] = extractJsonFromOutput(result.output);
    }
  }

  const totalDuration = Date.now() - startTime;

  // Generate summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                  BENCHMARK SUMMARY                        ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  console.log('📊 Results Overview:');
  console.log('┌────────────────────┬──────────┬──────────────┐');
  console.log('│ Benchmark          │ Status   │ Duration     │');
  console.log('├────────────────────┼──────────┼──────────────┤');

  for (const result of results) {
    const status = result.success ? '✅ Pass' : '❌ Fail';
    const duration = `${(result.duration / 1000).toFixed(1)}s`;
    console.log(`│ ${result.name.padEnd(18)} │ ${status.padEnd(8)} │ ${duration.padStart(10)}   │`);
  }

  console.log('├────────────────────┼──────────┼──────────────┤');
  console.log(`│ ${'Total'.padEnd(18)} │ ${results.filter(r => r.success).length}/${results.length} pass │ ${(totalDuration / 1000).toFixed(1)}s`.padEnd(52) + '│');
  console.log('└────────────────────┴──────────┴──────────────┘');
  console.log('');

  // Key metrics summary
  console.log('📈 Key Metrics:');

  // WebSocket metrics
  const wsResult = extractedResults['ws-latency'] as any;
  if (wsResult) {
    console.log(`   WebSocket:`);
    console.log(`      Connection Time: ${wsResult.connection?.timeMs || 'N/A'}ms`);
    console.log(`      Messages/sec:    ${wsResult.messages?.perSecond?.toFixed(2) || 'N/A'}`);
    console.log(`      Interval P50:    ${wsResult.interval?.p50?.toFixed(2) || 'N/A'}ms`);
  }

  // Order metrics
  const orderResult = extractedResults['order-latency'] as any;
  if (orderResult) {
    console.log(`   Order API:`);
    if (orderResult.getOrderbook) {
      console.log(`      Orderbook Avg:   ${orderResult.getOrderbook.avg?.toFixed(2) || 'N/A'}ms`);
    }
    if (orderResult.getBestPrices) {
      console.log(`      Best Prices Avg: ${orderResult.getBestPrices.avg?.toFixed(2) || 'N/A'}ms`);
    }
  }

  // RPC metrics
  const rpcResult = extractedResults['rpc-latency'] as any;
  if (rpcResult?.endpoints) {
    console.log(`   RPC Endpoints:`);
    for (const endpoint of rpcResult.endpoints) {
      if (endpoint.stats?.getBlockNumber) {
        console.log(`      ${endpoint.name}: ${endpoint.stats.getBlockNumber.avg?.toFixed(2) || 'N/A'}ms avg`);
      }
    }
  }

  console.log('');

  // Save results if output file specified
  if (OUTPUT_FILE) {
    const fullReport = {
      timestamp: new Date().toISOString(),
      system: systemInfo,
      totalDuration,
      benchmarks: results.map(r => ({
        name: r.name,
        success: r.success,
        duration: r.duration,
        results: extractedResults[r.name] || null,
      })),
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fullReport, null, 2));
    console.log(`📄 Full report saved to: ${OUTPUT_FILE}`);
  }

  // Recommendations
  console.log('💡 Recommendations:');
  console.log('   - Run on target server to compare with local results');
  console.log('   - Use --output flag to save results for comparison');
  console.log('   - Compare RPC endpoints to choose the fastest for your region');
  console.log('');

  // Exit with error if any benchmark failed
  const failedCount = results.filter(r => !r.success).length;
  if (failedCount > 0) {
    console.log(`⚠️ ${failedCount} benchmark(s) failed`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

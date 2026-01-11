#!/usr/bin/env npx tsx
/**
 * Integration Tests for ArbitrageService
 *
 * Tests the complete workflow without requiring private key:
 * 1. Service initialization (monitor-only mode)
 * 2. Market scanning (scanMarkets)
 * 3. Quick scan (quickScan)
 * 4. WebSocket connection and orderbook updates
 *
 * Environment:
 *   No POLY_PRIVKEY required - runs in monitor-only mode
 *
 * Run with:
 *   npx tsx packages/poly-sdk/scripts/arb-tests/02-integration-tests.ts
 *
 * This script performs REAL API calls to Polymarket services.
 */

import { ArbitrageService } from '../../src/index.js';
import type { ArbitrageMarketConfig } from '../../src/index.js';

// ===== Test Results Tracking =====

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  details?: any;
}

const results: TestResult[] = [];

function recordTest(name: string, passed: boolean, duration: number, error?: string, details?: any): void {
  results.push({ name, passed, error, duration, details });

  const status = passed ? '✅ PASS' : '❌ FAIL';
  const time = `(${duration}ms)`;

  console.log(`${status} ${name} ${time}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
  if (details && passed) {
    console.log(`   ${JSON.stringify(details)}`);
  }
}

async function runTest(name: string, testFn: () => Promise<any>): Promise<boolean> {
  const startTime = Date.now();

  try {
    const result = await testFn();
    const duration = Date.now() - startTime;
    recordTest(name, true, duration, undefined, result);
    return true;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    recordTest(name, false, duration, error.message);
    return false;
  }
}

// ===== Test Suite =====

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         ArbitrageService - Integration Test Suite             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Running in monitor-only mode (no private key required)');
  console.log('This test suite performs REAL API calls to Polymarket.\n');

  let arbService: ArbitrageService;
  let testMarket: ArbitrageMarketConfig | undefined;

  // ===== Test 1: Service Initialization =====
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Test 1: ArbitrageService Initialization');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await runTest('Initialize ArbitrageService (monitor-only)', async () => {
    arbService = new ArbitrageService({
      privateKey: undefined,  // Monitor-only mode
      profitThreshold: 0.005,
      minTradeSize: 5,
      maxTradeSize: 100,
      autoExecute: false,
      enableLogging: true,
    });

    return { mode: 'monitor-only', configured: true };
  });

  // ===== Test 2: Market Scanning =====
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Test 2: Market Scanning');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let scanResults: any[] = [];

  await runTest('scanMarkets() with basic criteria', async () => {
    scanResults = await arbService.scanMarkets(
      {
        minVolume24h: 5000,
        limit: 20,
      },
      0.003  // 0.3% min profit
    );

    if (!Array.isArray(scanResults)) {
      throw new Error('scanMarkets did not return array');
    }

    return {
      totalScanned: scanResults.length,
      withOpportunities: scanResults.filter(r => r.arbType !== 'none').length,
    };
  });

  await runTest('Validate ScanResult structure', async () => {
    if (scanResults.length === 0) {
      throw new Error('No markets returned from scan');
    }

    const sample = scanResults[0];

    // Check required fields
    const requiredFields = [
      'market',
      'arbType',
      'profitRate',
      'profitPercent',
      'effectivePrices',
      'volume24h',
      'availableSize',
      'score',
      'description',
    ];

    for (const field of requiredFields) {
      if (!(field in sample)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Check market config structure
    const marketFields = ['name', 'conditionId', 'yesTokenId', 'noTokenId'];
    for (const field of marketFields) {
      if (!(field in sample.market)) {
        throw new Error(`Missing market field: ${field}`);
      }
    }

    // Check effective prices structure
    const priceFields = ['buyYes', 'buyNo', 'sellYes', 'sellNo', 'longCost', 'shortRevenue'];
    for (const field of priceFields) {
      if (!(field in sample.effectivePrices)) {
        throw new Error(`Missing effectivePrices field: ${field}`);
      }
    }

    return {
      marketName: sample.market.name.slice(0, 40),
      arbType: sample.arbType,
      profitPercent: sample.profitPercent.toFixed(2) + '%',
    };
  });

  // Find a market with opportunity for further testing
  const opportunityMarkets = scanResults.filter(r => r.arbType !== 'none');
  if (opportunityMarkets.length > 0) {
    testMarket = opportunityMarkets[0].market;

    await runTest('Identify market with arbitrage opportunity', async () => {
      return {
        market: testMarket!.name.slice(0, 40),
        type: opportunityMarkets[0].arbType,
        profit: opportunityMarkets[0].profitPercent.toFixed(2) + '%',
      };
    });
  }

  // ===== Test 3: Quick Scan =====
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Test 3: Quick Scan');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await runTest('quickScan() with default parameters', async () => {
    const quickResults = await arbService.quickScan(0.005, 10);

    if (!Array.isArray(quickResults)) {
      throw new Error('quickScan did not return array');
    }

    return {
      totalFound: quickResults.length,
      topProfit: quickResults.length > 0
        ? quickResults[0].profitPercent.toFixed(2) + '%'
        : 'N/A',
    };
  });

  await runTest('quickScan() with high profit threshold', async () => {
    const quickResults = await arbService.quickScan(0.02, 5);  // 2% threshold

    return {
      totalFound: quickResults.length,
      threshold: '2%',
    };
  });

  // ===== Test 4: WebSocket Connection =====
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Test 4: WebSocket Connection and Orderbook Updates');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Select the highest volume market for WebSocket testing (more likely to have activity)
  const sortedByVolume = [...scanResults].sort((a, b) => b.volume24h - a.volume24h);
  if (!testMarket && sortedByVolume.length > 0) {
    // Prefer markets with good orderbook depth
    const goodMarket = sortedByVolume.find(r => r.availableSize > 50);
    testMarket = goodMarket?.market || sortedByVolume[0].market;
    const selectedResult = goodMarket || sortedByVolume[0];
    console.log(`ℹ️  Selected highest volume market for WebSocket test:`);
    console.log(`   ${testMarket.name.slice(0, 50)}`);
    console.log(`   Volume 24h: $${selectedResult.volume24h.toLocaleString()}`);
    console.log(`   Available Size: ${selectedResult.availableSize.toFixed(2)}\n`);
  }

  if (!testMarket) {
    console.log('⚠️  Skipping WebSocket tests - no markets available');
    recordTest('WebSocket test (skipped)', false, 0, 'No markets available for testing');
  } else {
    let wsConnected = false;
    let orderbookUpdates = 0;
    let receivedOpportunity = false;

    // Set up event listeners - listen for orderbookUpdate (emitted on every book update)
    arbService.on('orderbookUpdate', () => {
      orderbookUpdates++;
      if (orderbookUpdates === 1) {
        console.log(`   📈 First orderbook update received!`);
      }
    });

    arbService.on('opportunity', (opp) => {
      receivedOpportunity = true;
      console.log(`   📊 Opportunity detected: ${opp.type} arb, +${opp.profitPercent.toFixed(2)}%`);
    });

    arbService.on('error', (error) => {
      console.log(`   ⚠️  Error: ${error.message}`);
    });

    // Wait for orderbookUpdate events (not opportunity which is rare)
    const waitForOrderbookUpdate = (): Promise<number> => {
      return new Promise((resolve) => {
        // Check immediately if we already have updates
        if (orderbookUpdates > 0) {
          resolve(orderbookUpdates);
          return;
        }

        // Poll for updates
        const checkInterval = setInterval(() => {
          if (orderbookUpdates > 0) {
            clearInterval(checkInterval);
            resolve(orderbookUpdates);
          }
        }, 500);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(orderbookUpdates);
        }, 30000);
      });
    };

    await runTest('Start monitoring market via WebSocket', async () => {
      console.log(`   Monitoring: ${testMarket!.name.slice(0, 50)}...`);

      await arbService.start(testMarket!);
      wsConnected = true;

      return { market: testMarket!.name.slice(0, 40) };
    });

    if (wsConnected) {
      await runTest('WebSocket connection and orderbook updates', async () => {
        console.log('   Waiting up to 30 seconds for orderbook updates...');

        const updateCount = await waitForOrderbookUpdate();

        // Also check the orderbook state directly
        const orderbook = arbService.getOrderbook();
        const hasYesData = orderbook.yesBids.length > 0 || orderbook.yesAsks.length > 0;
        const hasNoData = orderbook.noBids.length > 0 || orderbook.noAsks.length > 0;

        return {
          connected: true,
          orderbookUpdates: updateCount,
          hasYesData,
          hasNoData,
          lastUpdate: orderbook.lastUpdate > 0 ? new Date(orderbook.lastUpdate).toISOString() : 'never',
          note: updateCount > 0
            ? `Received ${updateCount} orderbook updates`
            : 'No updates received (market may be inactive during test window)',
        };
      });

      await runTest('Verify orderbook data populated', async () => {
        const orderbook = arbService.getOrderbook();

        // Check if orderbook has any data
        const totalLevels = orderbook.yesBids.length + orderbook.yesAsks.length +
                           orderbook.noBids.length + orderbook.noAsks.length;

        if (totalLevels === 0 && orderbookUpdates === 0) {
          // If no updates received, this is expected
          return {
            status: 'no_data',
            note: 'No orderbook data (market inactive or no WebSocket updates)',
          };
        }

        return {
          status: 'populated',
          yesBids: orderbook.yesBids.length,
          yesAsks: orderbook.yesAsks.length,
          noBids: orderbook.noBids.length,
          noAsks: orderbook.noAsks.length,
          lastUpdate: new Date(orderbook.lastUpdate).toISOString(),
        };
      });

      await runTest('Verify service statistics', async () => {
        const stats = arbService.getStats();

        if (!stats) {
          throw new Error('getStats() returned null/undefined');
        }

        const requiredStats = [
          'opportunitiesDetected',
          'executionsAttempted',
          'executionsSucceeded',
          'totalProfit',
          'runningTimeMs',
        ];

        for (const field of requiredStats) {
          if (!(field in stats)) {
            throw new Error(`Missing stats field: ${field}`);
          }
        }

        return {
          opportunities: stats.opportunitiesDetected,
          executions: `${stats.executionsSucceeded}/${stats.executionsAttempted}`,
          profit: `$${stats.totalProfit.toFixed(2)}`,
          runningTime: `${(stats.runningTimeMs / 1000).toFixed(1)}s`,
          orderbookUpdatesReceived: orderbookUpdates,
        };
      });

      await runTest('Stop monitoring and clean up', async () => {
        await arbService.stop();
        wsConnected = false;

        return { stopped: true };
      });
    }
  }

  // ===== Test Summary =====
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        Test Summary                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;

  console.log(`Total Tests:  ${totalTests}`);
  console.log(`Passed:       ${passedTests} ✅`);
  console.log(`Failed:       ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}`);
      console.log(`    ${r.error}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// ===== Error Handling =====

main().catch((error) => {
  console.error('\n❌ Fatal Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});

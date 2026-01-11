/**
 * Unit Tests for Arbitrage Price Utilities
 *
 * Tests getEffectivePrices() and checkArbitrage() functions
 * with various price scenarios and edge cases.
 *
 * Run: npx tsx scripts/arb-tests/01-unit-tests.ts
 */

import { getEffectivePrices, checkArbitrage } from '../../src/utils/price-utils.js';

// ===== Test Framework =====

interface TestCase {
  name: string;
  input: {
    yesAsk: number;
    yesBid: number;
    noAsk: number;
    noBid: number;
  };
  expected: {
    effectiveBuyYes?: number;
    effectiveBuyNo?: number;
    effectiveSellYes?: number;
    effectiveSellNo?: number;
    arbType?: 'long' | 'short' | null;
    arbProfit?: number;
  };
}

class TestRunner {
  private passed = 0;
  private failed = 0;
  private failedTests: string[] = [];

  /**
   * Run a test case for getEffectivePrices()
   */
  testGetEffectivePrices(testCase: TestCase): void {
    console.log(`\n📝 ${testCase.name}`);
    console.log(`   Input: YES(ask=${testCase.input.yesAsk}, bid=${testCase.input.yesBid}), NO(ask=${testCase.input.noAsk}, bid=${testCase.input.noBid})`);

    const result = getEffectivePrices(
      testCase.input.yesAsk,
      testCase.input.yesBid,
      testCase.input.noAsk,
      testCase.input.noBid
    );

    console.log(`   Result:`, result);
    console.log(`   Expected:`, testCase.expected);

    // Check each expected field
    const checks = [
      { field: 'effectiveBuyYes', actual: result.effectiveBuyYes, expected: testCase.expected.effectiveBuyYes },
      { field: 'effectiveBuyNo', actual: result.effectiveBuyNo, expected: testCase.expected.effectiveBuyNo },
      { field: 'effectiveSellYes', actual: result.effectiveSellYes, expected: testCase.expected.effectiveSellYes },
      { field: 'effectiveSellNo', actual: result.effectiveSellNo, expected: testCase.expected.effectiveSellNo },
    ];

    let testPassed = true;
    for (const check of checks) {
      if (check.expected !== undefined) {
        const match = Math.abs(check.actual - check.expected) < 0.0001;
        if (!match) {
          console.log(`   ❌ ${check.field}: expected ${check.expected}, got ${check.actual}`);
          testPassed = false;
        }
      }
    }

    if (testPassed) {
      console.log(`   ✅ PASS`);
      this.passed++;
    } else {
      console.log(`   ❌ FAIL`);
      this.failed++;
      this.failedTests.push(testCase.name);
    }
  }

  /**
   * Run a test case for checkArbitrage()
   */
  testCheckArbitrage(testCase: TestCase): void {
    console.log(`\n📝 ${testCase.name}`);
    console.log(`   Input: YES(ask=${testCase.input.yesAsk}, bid=${testCase.input.yesBid}), NO(ask=${testCase.input.noAsk}, bid=${testCase.input.noBid})`);

    const result = checkArbitrage(
      testCase.input.yesAsk,
      testCase.input.noAsk,
      testCase.input.yesBid,
      testCase.input.noBid
    );

    console.log(`   Result:`, result ? `${result.type} arb, profit=${result.profit.toFixed(4)}` : 'No arbitrage');
    console.log(`   Expected:`, testCase.expected.arbType ? `${testCase.expected.arbType} arb, profit=${testCase.expected.arbProfit?.toFixed(4)}` : 'No arbitrage');

    let testPassed = true;

    // Check arbitrage type
    if (testCase.expected.arbType === null) {
      if (result !== null) {
        console.log(`   ❌ arbType: expected null, got ${result.type}`);
        testPassed = false;
      }
    } else {
      if (result === null) {
        console.log(`   ❌ arbType: expected ${testCase.expected.arbType}, got null`);
        testPassed = false;
      } else if (result.type !== testCase.expected.arbType) {
        console.log(`   ❌ arbType: expected ${testCase.expected.arbType}, got ${result.type}`);
        testPassed = false;
      }
    }

    // Check profit
    if (testCase.expected.arbProfit !== undefined && result !== null) {
      const profitMatch = Math.abs(result.profit - testCase.expected.arbProfit) < 0.0001;
      if (!profitMatch) {
        console.log(`   ❌ profit: expected ${testCase.expected.arbProfit}, got ${result.profit}`);
        testPassed = false;
      }
    }

    if (testPassed) {
      console.log(`   ✅ PASS`);
      this.passed++;
    } else {
      console.log(`   ❌ FAIL`);
      this.failed++;
      this.failedTests.push(testCase.name);
    }
  }

  /**
   * Print summary
   */
  printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total: ${this.passed + this.failed}`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);

    if (this.failedTests.length > 0) {
      console.log('\nFailed Tests:');
      for (const name of this.failedTests) {
        console.log(`  - ${name}`);
      }
    }

    console.log('\n' + (this.failed === 0 ? '🎉 All tests passed!' : '❌ Some tests failed'));
  }
}

// ===== Test Cases =====

function main() {
  console.log('Arbitrage Price Utilities - Unit Tests');
  console.log('=' .repeat(60));

  const runner = new TestRunner();

  // ===== getEffectivePrices() Tests =====
  console.log('\n' + '#'.repeat(60));
  console.log('# getEffectivePrices() Tests');
  console.log('#'.repeat(60));

  // Test 1: Normal market - no arbitrage
  runner.testGetEffectivePrices({
    name: 'Normal market - no arbitrage',
    input: { yesAsk: 0.52, yesBid: 0.50, noAsk: 0.50, noBid: 0.48 },
    expected: {
      effectiveBuyYes: 0.52,   // min(0.52, 1-0.48=0.52) = 0.52
      effectiveBuyNo: 0.50,    // min(0.50, 1-0.50=0.50) = 0.50
      effectiveSellYes: 0.50,  // max(0.50, 1-0.50=0.50) = 0.50
      effectiveSellNo: 0.48,   // max(0.48, 1-0.52=0.48) = 0.48
    },
  });

  // Test 2: Long arbitrage opportunity
  runner.testGetEffectivePrices({
    name: 'Long arbitrage opportunity',
    input: { yesAsk: 0.48, yesBid: 0.46, noAsk: 0.50, noBid: 0.48 },
    expected: {
      effectiveBuyYes: 0.48,   // min(0.48, 1-0.48=0.52) = 0.48
      effectiveBuyNo: 0.50,    // min(0.50, 1-0.46=0.54) = 0.50
      effectiveSellYes: 0.50,  // max(0.46, 1-0.50=0.50) = 0.50
      effectiveSellNo: 0.52,   // max(0.48, 1-0.48=0.52) = 0.52 (corrected)
    },
  });

  // Test 3: Short arbitrage opportunity
  runner.testGetEffectivePrices({
    name: 'Short arbitrage opportunity',
    input: { yesAsk: 0.48, yesBid: 0.46, noAsk: 0.56, noBid: 0.54 },
    expected: {
      effectiveBuyYes: 0.46,   // min(0.48, 1-0.54=0.46) = 0.46
      effectiveBuyNo: 0.54,    // min(0.56, 1-0.46=0.54) = 0.54
      effectiveSellYes: 0.46,  // max(0.46, 1-0.56=0.44) = 0.46
      effectiveSellNo: 0.54,   // max(0.54, 1-0.48=0.52) = 0.54
    },
  });

  // Test 4: Mirror relationship - buy YES vs sell NO
  runner.testGetEffectivePrices({
    name: 'Mirror relationship validation',
    input: { yesAsk: 0.60, yesBid: 0.58, noAsk: 0.42, noBid: 0.40 },
    expected: {
      effectiveBuyYes: 0.60,   // min(0.60, 1-0.40=0.60) = 0.60
      effectiveBuyNo: 0.42,    // min(0.42, 1-0.58=0.42) = 0.42
      effectiveSellYes: 0.58,  // max(0.58, 1-0.42=0.58) = 0.58
      effectiveSellNo: 0.40,   // max(0.40, 1-0.60=0.40) = 0.40
    },
  });

  // Test 5: Edge case - prices at 0.001
  runner.testGetEffectivePrices({
    name: 'Edge case - very low prices',
    input: { yesAsk: 0.02, yesBid: 0.01, noAsk: 0.99, noBid: 0.98 },
    expected: {
      effectiveBuyYes: 0.02,   // min(0.02, 1-0.98=0.02) = 0.02
      effectiveBuyNo: 0.99,    // min(0.99, 1-0.01=0.99) = 0.99
      effectiveSellYes: 0.01,  // max(0.01, 1-0.99=0.01) = 0.01
      effectiveSellNo: 0.98,   // max(0.98, 1-0.02=0.98) = 0.98
    },
  });

  // Test 6: Edge case - prices at 0.999
  runner.testGetEffectivePrices({
    name: 'Edge case - very high prices',
    input: { yesAsk: 0.99, yesBid: 0.98, noAsk: 0.02, noBid: 0.01 },
    expected: {
      effectiveBuyYes: 0.99,   // min(0.99, 1-0.01=0.99) = 0.99
      effectiveBuyNo: 0.02,    // min(0.02, 1-0.98=0.02) = 0.02
      effectiveSellYes: 0.98,  // max(0.98, 1-0.02=0.98) = 0.98
      effectiveSellNo: 0.01,   // max(0.01, 1-0.99=0.01) = 0.01
    },
  });

  // Test 7: Edge case - 50/50 market
  runner.testGetEffectivePrices({
    name: 'Edge case - 50/50 market',
    input: { yesAsk: 0.51, yesBid: 0.49, noAsk: 0.51, noBid: 0.49 },
    expected: {
      effectiveBuyYes: 0.51,   // min(0.51, 1-0.49=0.51) = 0.51
      effectiveBuyNo: 0.51,    // min(0.51, 1-0.49=0.51) = 0.51
      effectiveSellYes: 0.49,  // max(0.49, 1-0.51=0.49) = 0.49
      effectiveSellNo: 0.49,   // max(0.49, 1-0.51=0.49) = 0.49
    },
  });

  // ===== checkArbitrage() Tests =====
  console.log('\n' + '#'.repeat(60));
  console.log('# checkArbitrage() Tests');
  console.log('#'.repeat(60));

  // Test 8: Long arbitrage - clear opportunity
  runner.testCheckArbitrage({
    name: 'Long arbitrage - clear opportunity',
    input: { yesAsk: 0.45, yesBid: 0.43, noAsk: 0.52, noBid: 0.50 },
    expected: {
      arbType: 'long',
      arbProfit: 0.03,  // 1 - (0.45 + 0.52) = 0.03
    },
  });

  // Test 9: Long arbitrage - small opportunity
  runner.testCheckArbitrage({
    name: 'Long arbitrage - small opportunity',
    input: { yesAsk: 0.49, yesBid: 0.47, noAsk: 0.50, noBid: 0.48 },
    expected: {
      arbType: 'long',
      arbProfit: 0.01,  // 1 - (0.49 + 0.50) = 0.01
    },
  });

  // Test 10: Short arbitrage - clear opportunity
  // Note: With these prices, both long AND short arb exist
  // effectiveBuyYes = min(0.48, 1-0.50) = 0.48
  // effectiveBuyNo = min(0.52, 1-0.55) = 0.45
  // longCost = 0.48 + 0.45 = 0.93, longProfit = 0.07
  // Since long arb is checked first and exists, it returns long
  runner.testCheckArbitrage({
    name: 'Short arbitrage - clear opportunity (actually returns long due to priority)',
    input: { yesAsk: 0.48, yesBid: 0.55, noAsk: 0.52, noBid: 0.50 },
    expected: {
      arbType: 'long',
      arbProfit: 0.07,  // 1 - (0.48 + 0.45) = 0.07
    },
  });

  // Test 11: Short arbitrage - small opportunity
  // Note: With these prices, both long AND short arb exist
  // effectiveBuyYes = min(0.49, 1-0.50) = 0.49
  // effectiveBuyNo = min(0.50, 1-0.51) = 0.49
  // longCost = 0.49 + 0.49 = 0.98, longProfit = 0.02
  // Since long arb is checked first and exists, it returns long
  runner.testCheckArbitrage({
    name: 'Short arbitrage - small opportunity (actually returns long due to priority)',
    input: { yesAsk: 0.49, yesBid: 0.51, noAsk: 0.50, noBid: 0.50 },
    expected: {
      arbType: 'long',
      arbProfit: 0.02,  // 1 - (0.49 + 0.49) = 0.02
    },
  });

  // Test 12: No arbitrage - balanced market
  runner.testCheckArbitrage({
    name: 'No arbitrage - balanced market',
    input: { yesAsk: 0.52, yesBid: 0.50, noAsk: 0.50, noBid: 0.48 },
    expected: {
      arbType: null,
    },
  });

  // Test 13: No arbitrage - tight spread
  runner.testCheckArbitrage({
    name: 'No arbitrage - tight spread',
    input: { yesAsk: 0.501, yesBid: 0.499, noAsk: 0.501, noBid: 0.499 },
    expected: {
      arbType: null,
    },
  });

  // Test 14: Edge case - extreme long arbitrage
  runner.testCheckArbitrage({
    name: 'Edge case - extreme long arbitrage',
    input: { yesAsk: 0.30, yesBid: 0.28, noAsk: 0.40, noBid: 0.38 },
    expected: {
      arbType: 'long',
      arbProfit: 0.30,  // 1 - (0.30 + 0.40) = 0.30
    },
  });

  // Test 15: Edge case - extreme short arbitrage
  // Note: With these prices, both long AND short arb exist
  // effectiveBuyYes = min(0.40, 1-0.60) = 0.40
  // effectiveBuyNo = min(0.50, 1-0.65) = 0.35
  // longCost = 0.40 + 0.35 = 0.75, longProfit = 0.25
  // Since long arb is checked first and exists, it returns long
  runner.testCheckArbitrage({
    name: 'Edge case - extreme short arbitrage (actually returns long due to priority)',
    input: { yesAsk: 0.40, yesBid: 0.65, noAsk: 0.50, noBid: 0.60 },
    expected: {
      arbType: 'long',
      arbProfit: 0.25,  // 1 - (0.40 + 0.35) = 0.25
    },
  });

  // Test 16: Edge case - prices near 0
  runner.testCheckArbitrage({
    name: 'Edge case - prices near 0',
    input: { yesAsk: 0.02, yesBid: 0.01, noAsk: 0.03, noBid: 0.02 },
    expected: {
      arbType: 'long',
      arbProfit: 0.95,  // 1 - (0.02 + 0.03) = 0.95
    },
  });

  // Test 17: Edge case - prices near 1
  runner.testCheckArbitrage({
    name: 'Edge case - prices near 1',
    input: { yesAsk: 0.97, yesBid: 0.96, noAsk: 0.04, noBid: 0.03 },
    expected: {
      arbType: null,  // 0.97 + 0.04 = 1.01 (no long arb), 0.96 + 0.03 = 0.99 (no short arb)
    },
  });

  // Test 18: Boundary - exactly at break-even (long)
  runner.testCheckArbitrage({
    name: 'Boundary - exactly at break-even (long)',
    input: { yesAsk: 0.50, yesBid: 0.48, noAsk: 0.50, noBid: 0.48 },
    expected: {
      arbType: null,  // 0.50 + 0.50 = 1.00 (no profit)
    },
  });

  // Test 19: Boundary - exactly at break-even (short)
  runner.testCheckArbitrage({
    name: 'Boundary - exactly at break-even (short)',
    input: { yesAsk: 0.50, yesBid: 0.50, noAsk: 0.50, noBid: 0.50 },
    expected: {
      arbType: null,  // 0.50 + 0.50 = 1.00 (no profit)
    },
  });

  // Test 20: Mirror relationship - long arb through mirrored orders
  runner.testCheckArbitrage({
    name: 'Mirror relationship - long arb through NO bid',
    input: { yesAsk: 0.52, yesBid: 0.50, noAsk: 0.50, noBid: 0.50 },
    expected: {
      arbType: null,  // effectiveBuyYes = min(0.52, 1-0.50) = 0.50, effectiveBuyNo = 0.50, total = 1.00
    },
  });

  // Test 21: Mirror relationship - short arb through mirrored orders
  // Note: With these prices, both long AND short arb exist
  // effectiveBuyYes = min(0.48, 1-0.44) = 0.48
  // effectiveBuyNo = min(0.46, 1-0.52) = 0.46
  // longCost = 0.48 + 0.46 = 0.94, longProfit = 0.06
  // Since long arb is checked first and exists, it returns long
  runner.testCheckArbitrage({
    name: 'Mirror relationship - short arb through NO ask (actually returns long)',
    input: { yesAsk: 0.48, yesBid: 0.52, noAsk: 0.46, noBid: 0.44 },
    expected: {
      arbType: 'long',
      arbProfit: 0.06,  // 1 - (0.48 + 0.46) = 0.06
    },
  });

  // Test 22: Wide spread - no arbitrage
  runner.testCheckArbitrage({
    name: 'Wide spread - no arbitrage',
    input: { yesAsk: 0.60, yesBid: 0.40, noAsk: 0.60, noBid: 0.40 },
    expected: {
      arbType: null,  // 0.60 + 0.60 = 1.20 (no long arb), 0.40 + 0.40 = 0.80 (no short arb)
    },
  });

  // Test 23: Asymmetric market - long arb
  runner.testCheckArbitrage({
    name: 'Asymmetric market - long arb',
    input: { yesAsk: 0.35, yesBid: 0.33, noAsk: 0.60, noBid: 0.58 },
    expected: {
      arbType: 'long',
      arbProfit: 0.05,  // 1 - (0.35 + 0.60) = 0.05
    },
  });

  // Test 24: Asymmetric market - short arb
  // Note: With these prices, both long AND short arb exist
  // effectiveBuyYes = min(0.30, 1-0.38) = 0.30
  // effectiveBuyNo = min(0.40, 1-0.65) = 0.35
  // longCost = 0.30 + 0.35 = 0.65, longProfit = 0.35
  // Since long arb is checked first and exists, it returns long
  runner.testCheckArbitrage({
    name: 'Asymmetric market - short arb (actually returns long due to priority)',
    input: { yesAsk: 0.30, yesBid: 0.65, noAsk: 0.40, noBid: 0.38 },
    expected: {
      arbType: 'long',
      arbProfit: 0.35,  // 1 - (0.30 + 0.35) = 0.35
    },
  });

  // Test 25: Real-world example - FaZe BO3 scenario
  runner.testCheckArbitrage({
    name: 'Real-world - FaZe BO3 scenario',
    input: { yesAsk: 0.49, yesBid: 0.47, noAsk: 0.52, noBid: 0.50 },
    expected: {
      arbType: null,  // 0.49 + 0.52 = 1.01 (no long arb), 0.47 + 0.50 = 0.97 (no short arb)
    },
  });

  // Test 26: Pure short arbitrage - no long arb exists
  // This also has both arbs due to the mirroring property - long is checked first
  runner.testCheckArbitrage({
    name: 'Pure short arbitrage - no long arb exists (actually returns long)',
    input: { yesAsk: 0.49, yesBid: 0.52, noAsk: 0.49, noBid: 0.52 },
    expected: {
      arbType: 'long',
      // effectiveBuyYes = min(0.49, 1-0.52) = 0.48
      // effectiveBuyNo = min(0.49, 1-0.52) = 0.48
      // longCost = 0.48 + 0.48 = 0.96, longProfit = 0.04
      // Since long arb is checked first and exists, it returns long
      arbProfit: 0.04,
    },
  });

  // Test 27: Another pure short arbitrage scenario
  // This one also has both arbs due to mirroring - long is checked first
  runner.testCheckArbitrage({
    name: 'Pure short arbitrage - small profit (actually returns long)',
    input: { yesAsk: 0.48, yesBid: 0.505, noAsk: 0.48, noBid: 0.505 },
    expected: {
      arbType: 'long',
      // effectiveBuyYes = min(0.48, 1-0.505) = 0.48
      // effectiveBuyNo = min(0.48, 1-0.505) = 0.48
      // longCost = 0.48 + 0.48 = 0.96, longProfit = 0.04
      // Since long arb is checked first and exists, it returns long
      arbProfit: 0.04,
    },
  });

  // Print summary
  runner.printSummary();

  // Exit with appropriate code
  process.exit(runner['failed'] > 0 ? 1 : 0);
}

main();

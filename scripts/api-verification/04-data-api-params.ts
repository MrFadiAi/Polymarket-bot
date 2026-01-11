/**
 * Data API 参数验证脚本
 *
 * 目的：验证文档中提到的 API 参数是否真正可用
 * 原则：Don't trust, verify
 *
 * 验证内容：
 * - Activity: start, end, offset, sortBy, sortDirection, market
 * - Positions: limit, offset, sortBy, sortDirection, market, sizeThreshold, redeemable
 * - Trades: user, side, takerOnly
 * - Value: 端点是否可用
 * - Holders: 端点是否可用
 */

const DATA_API = 'https://data-api.polymarket.com';

// 测试用户: simonbanza (活跃交易者)
const TEST_ADDRESS = '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74';
// Trump 2024 市场
const TRUMP_CONDITION_ID = '0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917';

interface TestCase {
  name: string;
  url: string;
  description: string;
  expectedParams: string[];
}

// ===== P0: 关键功能验证 =====

const p0Tests: TestCase[] = [
  // Activity start/end
  {
    name: 'activity-with-start',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5&start=1733961600`, // 2024-12-12 00:00:00 UTC
    description: 'Activity 带 start 时间戳过滤',
    expectedParams: ['start'],
  },
  {
    name: 'activity-with-end',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5&end=1734048000`, // 2024-12-13 00:00:00 UTC
    description: 'Activity 带 end 时间戳过滤',
    expectedParams: ['end'],
  },
  {
    name: 'activity-with-range',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5&start=1733961600&end=1734048000`,
    description: 'Activity 带时间范围',
    expectedParams: ['start', 'end'],
  },
  // Activity offset
  {
    name: 'activity-with-offset',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5&offset=10`,
    description: 'Activity 带 offset 分页',
    expectedParams: ['offset'],
  },
  // Positions limit/offset
  {
    name: 'positions-with-limit',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&limit=5`,
    description: 'Positions 带 limit',
    expectedParams: ['limit'],
  },
  {
    name: 'positions-with-offset',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&limit=5&offset=0`,
    description: 'Positions 带 offset',
    expectedParams: ['offset'],
  },
];

// ===== P1: 重要功能验证 =====

const p1Tests: TestCase[] = [
  // Positions sortBy
  {
    name: 'positions-sortby-cashpnl',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&sortBy=CASHPNL`,
    description: 'Positions 按现金 PnL 排序',
    expectedParams: ['sortBy'],
  },
  {
    name: 'positions-sortby-percentpnl',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&sortBy=PERCENTPNL`,
    description: 'Positions 按百分比 PnL 排序',
    expectedParams: ['sortBy'],
  },
  {
    name: 'positions-sort-direction',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&sortBy=CASHPNL&sortDirection=ASC`,
    description: 'Positions 排序方向',
    expectedParams: ['sortBy', 'sortDirection'],
  },
  // Activity/Positions market filter
  {
    name: 'activity-with-market',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5&market=${TRUMP_CONDITION_ID}`,
    description: 'Activity 按市场过滤',
    expectedParams: ['market'],
  },
  {
    name: 'positions-with-market',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&market=${TRUMP_CONDITION_ID}`,
    description: 'Positions 按市场过滤',
    expectedParams: ['market'],
  },
  // Value endpoint
  {
    name: 'value-endpoint',
    url: `${DATA_API}/value?user=${TEST_ADDRESS}`,
    description: 'Value 端点 - 获取账户价值',
    expectedParams: [],
  },
  // Positions redeemable/mergeable
  {
    name: 'positions-redeemable',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&redeemable=true`,
    description: 'Positions 只返回可赎回的',
    expectedParams: ['redeemable'],
  },
  {
    name: 'positions-size-threshold',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&sizeThreshold=100`,
    description: 'Positions 最小仓位过滤',
    expectedParams: ['sizeThreshold'],
  },
];

// ===== P2: 增强功能验证 =====

const p2Tests: TestCase[] = [
  // Holders endpoint
  {
    name: 'holders-endpoint',
    url: `${DATA_API}/holders?market=${TRUMP_CONDITION_ID}&limit=5`,
    description: 'Holders 端点 - 获取市场持仓者',
    expectedParams: [],
  },
  // Trades with user
  {
    name: 'trades-with-user',
    url: `${DATA_API}/trades?user=${TEST_ADDRESS}&limit=5`,
    description: 'Trades 按用户过滤',
    expectedParams: ['user'],
  },
  // Activity sortBy/sortDirection
  {
    name: 'activity-sortby',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5&sortBy=CASH`,
    description: 'Activity 按金额排序',
    expectedParams: ['sortBy'],
  },
  {
    name: 'activity-sort-direction',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5&sortDirection=ASC`,
    description: 'Activity 排序方向',
    expectedParams: ['sortDirection'],
  },
];

async function runTest(test: TestCase): Promise<{
  name: string;
  success: boolean;
  status: number;
  dataCount?: number;
  error?: string;
  firstItem?: unknown;
}> {
  try {
    const response = await fetch(test.url);
    const status = response.status;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        name: test.name,
        success: false,
        status,
        error: text.slice(0, 200),
      };
    }

    const data = await response.json();

    return {
      name: test.name,
      success: true,
      status,
      dataCount: Array.isArray(data) ? data.length : 1,
      firstItem: Array.isArray(data) ? data[0] : data,
    };
  } catch (error) {
    return {
      name: test.name,
      success: false,
      status: 0,
      error: String(error),
    };
  }
}

async function runTestSuite(name: string, tests: TestCase[]): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 ${name}`);
  console.log('='.repeat(80));

  const results = [];

  for (const test of tests) {
    console.log(`\n📡 ${test.name}: ${test.description}`);
    console.log(`   URL: ${test.url.slice(0, 100)}...`);

    const result = await runTest(test);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ Status: ${result.status}, Count: ${result.dataCount}`);
      if (result.firstItem) {
        const preview = JSON.stringify(result.firstItem).slice(0, 150);
        console.log(`   📦 First: ${preview}...`);
      }
    } else {
      console.log(`   ❌ Status: ${result.status}`);
      console.log(`   ⚠️ Error: ${result.error}`);
    }
  }

  // Summary
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\n📊 Summary: ${passed}/${tests.length} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results.filter((r) => !r.success).forEach((r) => {
      console.log(`   - ${r.name}: ${r.error?.slice(0, 100)}`);
    });
  }
}

async function main(): Promise<void> {
  console.log('🚀 Data API 参数验证开始');
  console.log('Time:', new Date().toISOString());
  console.log('\nTest User: simonbanza');
  console.log('Address:', TEST_ADDRESS);
  console.log('Test Market: Trump 2024');

  // Run P0 tests
  await runTestSuite('P0: 关键功能 (时间过滤 + 分页)', p0Tests);

  // Run P1 tests
  await runTestSuite('P1: 重要功能 (排序 + 过滤 + Value)', p1Tests);

  // Run P2 tests
  await runTestSuite('P2: 增强功能 (Holders + Trades)', p2Tests);

  console.log('\n\n✅ 验证完成');
  console.log('\n📝 下一步: 根据验证结果更新 SDK 实现');
}

main().catch(console.error);

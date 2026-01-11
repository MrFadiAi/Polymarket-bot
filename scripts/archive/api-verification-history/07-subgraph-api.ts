/**
 * Polymarket Subgraph API 验证脚本
 *
 * 目的：验证 Goldsky Subgraph 端点是否可用，了解数据结构
 * 原则：Don't trust, verify
 *
 * Polymarket 有 5 个 Subgraph:
 * 1. Positions - 用户仓位、入场价、已实现 PnL
 * 2. PnL - 已实现/未实现 PnL、历史表现
 * 3. Activity - 交易、事件
 * 4. Orders - 订单簿分析
 * 5. Open Interest - 市场 OI
 */

// Goldsky Subgraph 端点
const SUBGRAPH_ENDPOINTS = {
  positions: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
  activity: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/prod/gn',
  orders: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orders-subgraph/prod/gn',
  openInterest: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/open-interest-subgraph/prod/gn',
};

// 测试用户
const TEST_ADDRESS = '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74'; // simonbanza

interface SubgraphTest {
  name: string;
  endpoint: string;
  query: string;
  description: string;
}

const tests: SubgraphTest[] = [
  // 1. Positions Subgraph
  {
    name: 'positions-schema',
    endpoint: SUBGRAPH_ENDPOINTS.positions,
    query: `{
      __schema {
        types {
          name
        }
      }
    }`,
    description: 'Positions Subgraph - 获取 schema 类型',
  },
  {
    name: 'positions-user',
    endpoint: SUBGRAPH_ENDPOINTS.positions,
    query: `{
      userPositions(
        where: { user: "${TEST_ADDRESS.toLowerCase()}" }
        first: 5
      ) {
        id
        user
        conditionId
        outcome
        balance
        avgPrice
        realizedPnl
        timestamp
      }
    }`,
    description: 'Positions Subgraph - 用户仓位',
  },

  // 2. PnL Subgraph
  {
    name: 'pnl-schema',
    endpoint: SUBGRAPH_ENDPOINTS.pnl,
    query: `{
      __schema {
        queryType {
          fields {
            name
          }
        }
      }
    }`,
    description: 'PnL Subgraph - 获取可用查询',
  },
  {
    name: 'pnl-user',
    endpoint: SUBGRAPH_ENDPOINTS.pnl,
    query: `{
      userPnLs(
        where: { user: "${TEST_ADDRESS.toLowerCase()}" }
        first: 5
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        user
        realizedPnl
        unrealizedPnl
        timestamp
      }
    }`,
    description: 'PnL Subgraph - 用户 PnL 历史',
  },

  // 3. Activity Subgraph
  {
    name: 'activity-schema',
    endpoint: SUBGRAPH_ENDPOINTS.activity,
    query: `{
      __schema {
        queryType {
          fields {
            name
          }
        }
      }
    }`,
    description: 'Activity Subgraph - 获取可用查询',
  },

  // 4. Orders Subgraph
  {
    name: 'orders-schema',
    endpoint: SUBGRAPH_ENDPOINTS.orders,
    query: `{
      __schema {
        queryType {
          fields {
            name
          }
        }
      }
    }`,
    description: 'Orders Subgraph - 获取可用查询',
  },

  // 5. Open Interest Subgraph
  {
    name: 'oi-schema',
    endpoint: SUBGRAPH_ENDPOINTS.openInterest,
    query: `{
      __schema {
        queryType {
          fields {
            name
          }
        }
      }
    }`,
    description: 'Open Interest Subgraph - 获取可用查询',
  },
];

async function runGraphQLQuery(
  endpoint: string,
  query: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = await response.json();
    if (result.errors) {
      return {
        success: false,
        error: JSON.stringify(result.errors),
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function runTest(test: SubgraphTest): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📡 ${test.name}: ${test.description}`);
  console.log(`Endpoint: ${test.endpoint.slice(0, 80)}...`);
  console.log('='.repeat(80));

  const result = await runGraphQLQuery(test.endpoint, test.query);

  if (result.success) {
    console.log('✅ Success');
    console.log('📦 Response:');
    console.log(JSON.stringify(result.data, null, 2).slice(0, 1500));
  } else {
    console.log('❌ Failed');
    console.log(`⚠️ Error: ${result.error?.slice(0, 500)}`);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Polymarket Subgraph API 验证开始');
  console.log('Time:', new Date().toISOString());
  console.log('\nTest User:', TEST_ADDRESS);
  console.log('\n📋 Subgraph Endpoints:');
  Object.entries(SUBGRAPH_ENDPOINTS).forEach(([name, url]) => {
    console.log(`  ${name}: ${url.slice(0, 70)}...`);
  });

  for (const test of tests) {
    await runTest(test);
  }

  console.log('\n\n✅ 验证完成');
}

main().catch(console.error);

/**
 * Data API 验证脚本
 *
 * 目的：实际调用 Data API，记录真实返回结构
 * 原则：Don't trust, verify
 */

const DATA_API = 'https://data-api.polymarket.com';

interface ApiEndpoint {
  name: string;
  url: string;
  description: string;
}

// 使用 simonbanza 作为测试用户
const TEST_ADDRESS = '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74';
// Trump 2024 市场
const TRUMP_CONDITION_ID = '0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917';
const TRUMP_YES_TOKEN_ID = '21742633143463906290569050155826241533067272736897614950488156847949938836455';

const endpoints: ApiEndpoint[] = [
  // === Wallet 数据 ===
  {
    name: 'positions',
    url: `${DATA_API}/positions?user=${TEST_ADDRESS}&limit=5`,
    description: '获取用户持仓',
  },
  {
    name: 'value',
    url: `${DATA_API}/value?user=${TEST_ADDRESS}`,
    description: '获取用户账户价值',
  },
  {
    name: 'leaderboard',
    url: `${DATA_API}/leaderboard?limit=5`,
    description: '获取排行榜',
  },

  // === 行为数据 ===
  {
    name: 'activity',
    url: `${DATA_API}/activity?user=${TEST_ADDRESS}&limit=5`,
    description: '获取用户活动',
  },
  {
    name: 'trades-by-user',
    url: `${DATA_API}/trades?user=${TEST_ADDRESS}&limit=5`,
    description: '获取用户交易记录',
  },
  {
    name: 'trades-by-market',
    url: `${DATA_API}/trades?market=${TRUMP_CONDITION_ID}&limit=5`,
    description: '获取市场交易记录',
  },

  // === 市场数据 ===
  {
    name: 'holders',
    url: `${DATA_API}/holders?market=${TRUMP_CONDITION_ID}&limit=5`,
    description: '获取市场持仓者',
  },
  {
    name: 'timeseries',
    url: `${DATA_API}/timeseries?market=${TRUMP_CONDITION_ID}&fidelity=60`,
    description: '获取价格时序数据',
  },
  {
    name: 'prices-history',
    url: `${DATA_API}/prices-history?market=${TRUMP_CONDITION_ID}&interval=max`,
    description: '获取历史价格',
  },
];

async function verifyEndpoint(endpoint: ApiEndpoint): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📡 ${endpoint.name}: ${endpoint.description}`);
  console.log(`URL: ${endpoint.url}`);
  console.log('='.repeat(80));

  try {
    const response = await fetch(endpoint.url);

    if (!response.ok) {
      console.log(`\n❌ Status: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log(`Response: ${text.slice(0, 500)}`);
      return;
    }

    const data = await response.json();

    console.log(`\n✅ Status: ${response.status}`);
    console.log(`📦 Response Type: ${Array.isArray(data) ? 'Array' : typeof data}`);

    if (Array.isArray(data) && data.length > 0) {
      console.log(`📊 Array Length: ${data.length}`);
      console.log('\n🔍 First Item Structure:');
      console.log(JSON.stringify(data[0], null, 2));

      // 列出所有字段
      console.log('\n📋 All Fields in First Item:');
      const fields = Object.keys(data[0]).sort();
      fields.forEach((field, i) => {
        const value = data[0][field];
        const type = Array.isArray(value) ? 'array' : typeof value;
        const preview = type === 'string' ? `"${String(value).slice(0, 50)}..."` :
                       type === 'array' ? `[${value.length} items]` :
                       type === 'object' && value !== null ? `{...}` :
                       JSON.stringify(value);
        console.log(`  ${i + 1}. ${field}: ${type} = ${preview}`);
      });
    } else if (typeof data === 'object' && data !== null) {
      console.log('\n🔍 Response Structure:');
      console.log(JSON.stringify(data, null, 2));

      // 列出所有字段
      console.log('\n📋 All Fields:');
      const fields = Object.keys(data).sort();
      fields.forEach((field, i) => {
        const value = data[field];
        const type = Array.isArray(value) ? 'array' : typeof value;
        const preview = type === 'string' ? `"${String(value).slice(0, 50)}..."` :
                       type === 'array' ? `[${value.length} items]` :
                       type === 'object' && value !== null ? `{...}` :
                       JSON.stringify(value);
        console.log(`  ${i + 1}. ${field}: ${type} = ${preview}`);
      });
    } else {
      console.log('\n🔍 Response:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.log(`\n❌ Error: ${error}`);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Data API 验证开始');
  console.log('Base URL:', DATA_API);
  console.log('Time:', new Date().toISOString());
  console.log('\nTest User: simonbanza');
  console.log('Address:', TEST_ADDRESS);
  console.log('Test Market: Trump 2024 Presidential Election');

  for (const endpoint of endpoints) {
    await verifyEndpoint(endpoint);
  }

  console.log('\n\n✅ 验证完成');
}

main().catch(console.error);

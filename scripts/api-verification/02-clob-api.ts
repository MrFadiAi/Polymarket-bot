/**
 * CLOB API 验证脚本
 *
 * 目的：实际调用 CLOB API，记录真实返回结构
 * 原则：Don't trust, verify
 */

const CLOB_API = 'https://clob.polymarket.com';

interface ApiEndpoint {
  name: string;
  url: string;
  description: string;
}

// 使用 Trump 2024 市场作为测试用例
const TRUMP_CONDITION_ID = '0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917';
const TRUMP_YES_TOKEN_ID = '21742633143463906290569050155826241533067272736897614950488156847949938836455';

const endpoints: ApiEndpoint[] = [
  {
    name: 'markets-list',
    url: `${CLOB_API}/markets?limit=2`,
    description: '获取市场列表',
  },
  {
    name: 'market-by-condition-id',
    url: `${CLOB_API}/markets/${TRUMP_CONDITION_ID}`,
    description: '按 conditionId 获取单个市场',
  },
  {
    name: 'orderbook',
    url: `${CLOB_API}/book?token_id=${TRUMP_YES_TOKEN_ID}`,
    description: '获取订单簿',
  },
  {
    name: 'midpoint',
    url: `${CLOB_API}/midpoint?token_id=${TRUMP_YES_TOKEN_ID}`,
    description: '获取中间价',
  },
  {
    name: 'price',
    url: `${CLOB_API}/price?token_id=${TRUMP_YES_TOKEN_ID}&side=BUY`,
    description: '获取最优价格',
  },
  {
    name: 'spread',
    url: `${CLOB_API}/spread?token_id=${TRUMP_YES_TOKEN_ID}`,
    description: '获取买卖价差',
  },
  {
    name: 'tick-size',
    url: `${CLOB_API}/tick-size?token_id=${TRUMP_YES_TOKEN_ID}`,
    description: '获取最小价格单位',
  },
  {
    name: 'neg-risk',
    url: `${CLOB_API}/neg-risk?token_id=${TRUMP_YES_TOKEN_ID}`,
    description: '获取 neg-risk 信息',
  },
];

async function verifyEndpoint(endpoint: ApiEndpoint): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📡 ${endpoint.name}: ${endpoint.description}`);
  console.log(`URL: ${endpoint.url}`);
  console.log('='.repeat(80));

  try {
    const response = await fetch(endpoint.url);
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
                       type === 'object' ? `{...}` :
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
  console.log('🚀 CLOB API 验证开始');
  console.log('Base URL:', CLOB_API);
  console.log('Time:', new Date().toISOString());
  console.log('\nTest Market: Trump 2024 Presidential Election');
  console.log('Condition ID:', TRUMP_CONDITION_ID);
  console.log('YES Token ID:', TRUMP_YES_TOKEN_ID);

  for (const endpoint of endpoints) {
    await verifyEndpoint(endpoint);
  }

  console.log('\n\n✅ 验证完成');
}

main().catch(console.error);

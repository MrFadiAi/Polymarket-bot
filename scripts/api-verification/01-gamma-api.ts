/**
 * Gamma API 验证脚本
 *
 * 目的：实际调用 Gamma API，记录真实返回结构
 * 原则：Don't trust, verify
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';

interface ApiEndpoint {
  name: string;
  url: string;
  description: string;
}

const endpoints: ApiEndpoint[] = [
  {
    name: 'markets',
    url: `${GAMMA_API}/markets?limit=2&active=true`,
    description: '获取市场列表',
  },
  {
    name: 'markets-by-slug',
    url: `${GAMMA_API}/markets?slug=will-donald-trump-win-the-2024-us-presidential-election`,
    description: '按 slug 获取市场',
  },
  {
    name: 'events',
    url: `${GAMMA_API}/events?limit=2&active=true`,
    description: '获取事件列表',
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
    } else {
      console.log('\n🔍 Response:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.log(`\n❌ Error: ${error}`);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Gamma API 验证开始');
  console.log('Base URL:', GAMMA_API);
  console.log('Time:', new Date().toISOString());

  for (const endpoint of endpoints) {
    await verifyEndpoint(endpoint);
  }

  console.log('\n\n✅ 验证完成');
}

main().catch(console.error);

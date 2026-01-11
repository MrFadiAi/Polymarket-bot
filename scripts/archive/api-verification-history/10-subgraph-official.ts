/**
 * 验证 Polymarket 官方 Subgraph 端点
 *
 * 基于官方文档: https://docs.polymarket.com/developers/subgraph/overview
 * Schema 仓库: https://github.com/Polymarket/polymarket-subgraph
 */

// 官方确认的端点版本
const SUBGRAPH_ENDPOINTS = {
  orderbook: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn',
  positions: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  activity: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn',
  oi: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/oi-subgraph/0.0.6/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
};

const TEST_ADDRESS = '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74';

async function query(endpoint: string, q: string): Promise<{ data?: unknown; errors?: unknown[] }> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    if (!response.ok) {
      return { errors: [{ message: `HTTP ${response.status}` }] };
    }
    return await response.json();
  } catch (e) {
    return { errors: [{ message: String(e) }] };
  }
}

interface SchemaField {
  name: string;
  type: { name: string; kind: string; ofType?: { name: string } };
}

async function getSchemaFields(endpoint: string, typeName: string): Promise<string[]> {
  const result = await query(endpoint, `{
    __type(name: "${typeName}") {
      fields { name type { name kind ofType { name } } }
    }
  }`);
  if (result.errors || !result.data) return [];
  const type = (result.data as { __type?: { fields: SchemaField[] } }).__type;
  return type?.fields?.map((f) => f.name) || [];
}

async function getQueryFields(endpoint: string): Promise<string[]> {
  const result = await query(endpoint, `{
    __schema {
      queryType {
        fields { name }
      }
    }
  }`);
  if (result.errors || !result.data) return [];
  const schema = result.data as { __schema: { queryType: { fields: Array<{ name: string }> } } };
  return schema.__schema.queryType.fields.map((f) => f.name).filter((n) => !n.startsWith('_'));
}

async function testEndpoint(name: string, endpoint: string, testQuery: string): Promise<boolean> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 ${name}`);
  console.log(`${'─'.repeat(60)}`);

  const result = await query(endpoint, testQuery);

  if (result.errors) {
    console.log('❌ Error:', JSON.stringify(result.errors).slice(0, 200));
    return false;
  }

  console.log('✅ Success');
  console.log(JSON.stringify(result.data, null, 2).slice(0, 600));
  return true;
}

async function exploreSubgraph(name: string, endpoint: string): Promise<void> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔍 ${name} Subgraph`);
  console.log(`${'═'.repeat(60)}`);

  // 获取可用查询
  const queries = await getQueryFields(endpoint);
  console.log('\n📋 可用查询:', queries.join(', '));
}

async function main(): Promise<void> {
  console.log('🚀 验证 Polymarket 官方 Subgraph');
  console.log('基于: https://docs.polymarket.com/developers/subgraph/overview');
  console.log('Time:', new Date().toISOString());

  const results: Record<string, boolean> = {};

  // ========== 1. Positions Subgraph ==========
  await exploreSubgraph('Positions', SUBGRAPH_ENDPOINTS.positions);

  const posFields = await getSchemaFields(SUBGRAPH_ENDPOINTS.positions, 'UserBalance');
  console.log('\n📋 UserBalance 字段:', posFields.join(', '));

  results['positions-userBalances'] = await testEndpoint('Positions - UserBalances', SUBGRAPH_ENDPOINTS.positions, `{
    userBalances(
      where: { user: "${TEST_ADDRESS.toLowerCase()}" }
      first: 3
      orderBy: balance
      orderDirection: desc
    ) {
      id
      user
      tokenId
      balance
      avgPrice
    }
  }`);

  // ========== 2. PnL Subgraph ==========
  await exploreSubgraph('PnL', SUBGRAPH_ENDPOINTS.pnl);

  const pnlFields = await getSchemaFields(SUBGRAPH_ENDPOINTS.pnl, 'UserPosition');
  console.log('\n📋 UserPosition 字段:', pnlFields.join(', '));

  results['pnl-userPositions'] = await testEndpoint('PnL - UserPositions', SUBGRAPH_ENDPOINTS.pnl, `{
    userPositions(
      where: { user: "${TEST_ADDRESS.toLowerCase()}" }
      first: 3
      orderBy: realizedPnl
      orderDirection: desc
    ) {
      id
      user
      tokenId
      amount
      avgPrice
      realizedPnl
      totalBought
    }
  }`);

  results['pnl-conditions'] = await testEndpoint('PnL - Conditions', SUBGRAPH_ENDPOINTS.pnl, `{
    conditions(first: 3) {
      id
      positionIds
      payoutNumerators
      payoutDenominator
    }
  }`);

  // ========== 3. Activity Subgraph ==========
  await exploreSubgraph('Activity', SUBGRAPH_ENDPOINTS.activity);

  const splitFields = await getSchemaFields(SUBGRAPH_ENDPOINTS.activity, 'Split');
  console.log('\n📋 Split 字段:', splitFields.join(', '));

  results['activity-splits'] = await testEndpoint('Activity - Splits', SUBGRAPH_ENDPOINTS.activity, `{
    splits(
      first: 3
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      timestamp
      stakeholder
      condition
      amount
    }
  }`);

  results['activity-redemptions'] = await testEndpoint('Activity - Redemptions', SUBGRAPH_ENDPOINTS.activity, `{
    redemptions(
      first: 3
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      timestamp
      redeemer
      condition
      payout
    }
  }`);

  // ========== 4. OI Subgraph ==========
  await exploreSubgraph('OI', SUBGRAPH_ENDPOINTS.oi);

  const oiFields = await getSchemaFields(SUBGRAPH_ENDPOINTS.oi, 'MarketOpenInterest');
  console.log('\n📋 MarketOpenInterest 字段:', oiFields.join(', '));

  results['oi-marketOpenInterests'] = await testEndpoint('OI - MarketOpenInterests', SUBGRAPH_ENDPOINTS.oi, `{
    marketOpenInterests(first: 5, orderBy: amount, orderDirection: desc) {
      id
      amount
    }
  }`);

  results['oi-global'] = await testEndpoint('OI - GlobalOpenInterest', SUBGRAPH_ENDPOINTS.oi, `{
    globalOpenInterests(first: 1) {
      id
      amount
    }
  }`);

  // ========== 5. Orderbook Subgraph ==========
  await exploreSubgraph('Orderbook', SUBGRAPH_ENDPOINTS.orderbook);

  const obFields = await getSchemaFields(SUBGRAPH_ENDPOINTS.orderbook, 'OrderFilledEvent');
  console.log('\n📋 OrderFilledEvent 字段:', obFields.join(', '));

  results['orderbook-fills'] = await testEndpoint('Orderbook - OrderFilledEvents', SUBGRAPH_ENDPOINTS.orderbook, `{
    orderFilledEvents(
      first: 3
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      orderHash
      maker
      taker
      makerAssetId
      takerAssetId
      makerAmountFilled
      takerAmountFilled
      timestamp
    }
  }`);

  // ========== 汇总 ==========
  console.log('\n' + '═'.repeat(60));
  console.log('📋 验证结果汇总');
  console.log('═'.repeat(60));

  let passed = 0;
  let failed = 0;
  for (const [name, success] of Object.entries(results)) {
    console.log(`  ${success ? '✅' : '❌'} ${name}`);
    if (success) passed++;
    else failed++;
  }

  console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
  console.log('\n✅ 验证完成');
}

main().catch(console.error);

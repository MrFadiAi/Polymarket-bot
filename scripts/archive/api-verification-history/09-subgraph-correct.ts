/**
 * 使用官方 schema 验证 Polymarket Subgraph
 *
 * 基于 polymarket-subgraph 仓库的 schema.graphql
 */

const SUBGRAPH_ENDPOINTS = {
  // 注意：端点 URL 可能需要更新版本号
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
  activity: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.5/gn',
  oi: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/oi-subgraph/0.0.4/gn',
  wallet: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/wallet-subgraph/0.0.3/gn',
};

const TEST_ADDRESS = '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74';
const TEST_CONDITION_ID = '0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917';

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

async function testEndpoint(name: string, endpoint: string, testQuery: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${name}`);
  console.log(`Endpoint: ${endpoint.slice(0, 70)}...`);
  console.log('='.repeat(60));

  const result = await query(endpoint, testQuery);

  if (result.errors) {
    console.log('❌ Error:', JSON.stringify(result.errors).slice(0, 300));
  } else {
    console.log('✅ Success');
    console.log(JSON.stringify(result.data, null, 2).slice(0, 800));
  }
}

async function main(): Promise<void> {
  console.log('🔍 验证 Polymarket Subgraph (使用官方 schema)');
  console.log('Time:', new Date().toISOString());

  // 1. PnL Subgraph - UserPosition
  await testEndpoint('PnL Subgraph - UserPositions', SUBGRAPH_ENDPOINTS.pnl, `{
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

  // 2. PnL Subgraph - Conditions
  await testEndpoint('PnL Subgraph - Conditions', SUBGRAPH_ENDPOINTS.pnl, `{
    conditions(first: 3) {
      id
      positionIds
      payoutNumerators
      payoutDenominator
    }
  }`);

  // 3. Activity Subgraph - Splits
  await testEndpoint('Activity Subgraph - Splits', SUBGRAPH_ENDPOINTS.activity, `{
    splits(
      where: { stakeholder: "${TEST_ADDRESS.toLowerCase()}" }
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

  // 4. Activity Subgraph - Redemptions
  await testEndpoint('Activity Subgraph - Redemptions', SUBGRAPH_ENDPOINTS.activity, `{
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

  // 5. OI Subgraph - MarketOpenInterest
  await testEndpoint('OI Subgraph - MarketOpenInterest', SUBGRAPH_ENDPOINTS.oi, `{
    marketOpenInterests(first: 5, orderBy: amount, orderDirection: desc) {
      id
      amount
    }
  }`);

  // 6. Wallet Subgraph - Wallets
  await testEndpoint('Wallet Subgraph - Wallets', SUBGRAPH_ENDPOINTS.wallet, `{
    wallets(first: 3, orderBy: balance, orderDirection: desc) {
      id
      signer
      type
      balance
      lastTransfer
      createdAt
    }
  }`);

  // 7. 检查端点版本
  console.log('\n' + '='.repeat(60));
  console.log('📋 尝试查找可用版本');
  console.log('='.repeat(60));

  // 尝试不同版本的 activity subgraph
  const versions = ['prod', '0.0.5', '0.0.4', '0.0.3', '0.0.2', '0.0.1'];
  for (const ver of versions) {
    const url = `https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/${ver}/gn`;
    const result = await query(url, '{ splits(first: 1) { id } }');
    const status = result.errors ? '❌' : '✅';
    console.log(`  activity-subgraph/${ver}: ${status}`);
  }

  console.log('\n✅ 验证完成');
}

main().catch(console.error);

/**
 * 深入探索 Polymarket Subgraph 结构
 *
 * 只测试可用的两个 Subgraph: positions 和 pnl
 */

const SUBGRAPH_ENDPOINTS = {
  positions: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
};

const TEST_ADDRESS = '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74';

async function query(endpoint: string, q: string): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const result = await response.json();
  if (result.errors) {
    throw new Error(JSON.stringify(result.errors));
  }
  return result.data;
}

async function main(): Promise<void> {
  console.log('🔍 深入探索 Polymarket Subgraph\n');

  // ===== 1. Positions Subgraph =====
  console.log('='.repeat(80));
  console.log('📊 1. Positions Subgraph');
  console.log('='.repeat(80));

  // 获取可用查询
  console.log('\n📋 可用查询字段:');
  const posSchema = await query(SUBGRAPH_ENDPOINTS.positions, `{
    __schema {
      queryType {
        fields {
          name
          type { name kind }
          args { name type { name } }
        }
      }
    }
  }`);
  const posFields = (posSchema as { __schema: { queryType: { fields: Array<{ name: string; type: { name: string; kind: string }; args: Array<{ name: string; type: { name: string } }> }> } } }).__schema.queryType.fields;
  posFields.forEach((f: { name: string; type: { name: string; kind: string }; args: Array<{ name: string; type: { name: string } }> }) => {
    const args = f.args.map((a: { name: string; type: { name: string } }) => a.name).join(', ');
    console.log(`  - ${f.name}(${args}) -> ${f.type.name || f.type.kind}`);
  });

  // 查询 UserBalance 结构
  console.log('\n📋 UserBalance 字段:');
  const ubSchema = await query(SUBGRAPH_ENDPOINTS.positions, `{
    __type(name: "UserBalance") {
      fields {
        name
        type { name kind ofType { name } }
      }
    }
  }`);
  const ubFields = (ubSchema as { __type: { fields: Array<{ name: string; type: { name: string; kind: string; ofType?: { name: string } } }> } }).__type.fields;
  ubFields.forEach((f: { name: string; type: { name: string; kind: string; ofType?: { name: string } } }) => {
    console.log(`  - ${f.name}: ${f.type.name || f.type.ofType?.name || f.type.kind}`);
  });

  // 查询用户余额
  console.log('\n📋 查询用户余额 (UserBalance):');
  try {
    const userBalances = await query(SUBGRAPH_ENDPOINTS.positions, `{
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
        firstTxHash
        latestTxHash
        createdTimestamp
        lastUpdatedTimestamp
      }
    }`);
    console.log(JSON.stringify(userBalances, null, 2));
  } catch (e) {
    console.log('  ❌ Error:', String(e).slice(0, 200));
  }

  // 查询 NetUserBalance
  console.log('\n📋 NetUserBalance 字段:');
  const nubSchema = await query(SUBGRAPH_ENDPOINTS.positions, `{
    __type(name: "NetUserBalance") {
      fields {
        name
        type { name kind ofType { name } }
      }
    }
  }`);
  const nubFields = (nubSchema as { __type: { fields: Array<{ name: string; type: { name: string; kind: string; ofType?: { name: string } } }> } }).__type.fields;
  nubFields.forEach((f: { name: string; type: { name: string; kind: string; ofType?: { name: string } } }) => {
    console.log(`  - ${f.name}: ${f.type.name || f.type.ofType?.name || f.type.kind}`);
  });

  // ===== 2. PnL Subgraph =====
  console.log('\n' + '='.repeat(80));
  console.log('📊 2. PnL Subgraph');
  console.log('='.repeat(80));

  // 获取可用查询
  console.log('\n📋 可用查询字段:');
  const pnlSchema = await query(SUBGRAPH_ENDPOINTS.pnl, `{
    __schema {
      queryType {
        fields {
          name
          type { name kind }
        }
      }
    }
  }`);
  const pnlFields = (pnlSchema as { __schema: { queryType: { fields: Array<{ name: string; type: { name: string; kind: string } }> } } }).__schema.queryType.fields;
  pnlFields.forEach((f: { name: string; type: { name: string; kind: string } }) => {
    console.log(`  - ${f.name} -> ${f.type.name || f.type.kind}`);
  });

  // 查询 UserPosition 结构
  console.log('\n📋 UserPosition 字段:');
  const upSchema = await query(SUBGRAPH_ENDPOINTS.pnl, `{
    __type(name: "UserPosition") {
      fields {
        name
        type { name kind ofType { name } }
      }
    }
  }`);
  const upFields = (upSchema as { __type: { fields: Array<{ name: string; type: { name: string; kind: string; ofType?: { name: string } } }> } }).__type.fields;
  upFields.forEach((f: { name: string; type: { name: string; kind: string; ofType?: { name: string } } }) => {
    console.log(`  - ${f.name}: ${f.type.name || f.type.ofType?.name || f.type.kind}`);
  });

  // 查询用户持仓
  console.log('\n📋 查询用户持仓 (userPositions):');
  try {
    const positions = await query(SUBGRAPH_ENDPOINTS.pnl, `{
      userPositions(
        where: { user: "${TEST_ADDRESS.toLowerCase()}" }
        first: 3
        orderBy: realizedPnl
        orderDirection: desc
      ) {
        id
        user
        conditionId
        outcome
        balance
        avgPrice
        realizedPnl
        feePaid
        createdTimestamp
        lastUpdatedTimestamp
      }
    }`);
    console.log(JSON.stringify(positions, null, 2));
  } catch (e) {
    console.log('  ❌ Error:', String(e).slice(0, 200));
  }

  // 查询 Condition 结构
  console.log('\n📋 Condition 字段:');
  const condSchema = await query(SUBGRAPH_ENDPOINTS.pnl, `{
    __type(name: "Condition") {
      fields {
        name
        type { name kind ofType { name } }
      }
    }
  }`);
  const condFields = (condSchema as { __type: { fields: Array<{ name: string; type: { name: string; kind: string; ofType?: { name: string } } }> } }).__type.fields;
  condFields.forEach((f: { name: string; type: { name: string; kind: string; ofType?: { name: string } } }) => {
    console.log(`  - ${f.name}: ${f.type.name || f.type.ofType?.name || f.type.kind}`);
  });

  console.log('\n✅ 探索完成');
}

main().catch(console.error);

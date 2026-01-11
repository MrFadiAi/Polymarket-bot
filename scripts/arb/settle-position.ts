#!/usr/bin/env npx tsx
/**
 * Settle Position - 市场结束后清算脚本
 *
 * 功能:
 * 1. 查看当前持仓 (YES + NO)
 * 2. Merge 所有配对的 tokens → 回收 USDC
 * 3. 显示剩余的单边 tokens（等市场结算后 redeem）
 *
 * 用法:
 *   # 查看持仓
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/settle-position.ts
 *
 *   # 执行 merge
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/settle-position.ts --merge
 *
 *   # 指定市场
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/settle-position.ts --merge --market map1
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/settle-position.ts --merge --market bo3
 */

import { CTFClient } from '../../src/index.js';

// ============== Market Configurations ==============
const MARKETS = {
  map1: {
    name: 'CS2: FaZe vs Passion UA - Map 1 Winner',
    conditionId: '0x8307e29e55c51624bf7dc2448f640902deda12a798bf4f9389f50effed5ca8e3',
    yesTokenId: '43483263124644478520592164117863889505064690344162739837819619686304683165329',
    noTokenId: '82507526040280959004054227385878378176592321458993996786469194286964091170010',
    outcomes: ['FaZe', 'Passion UA'],
  },
  map2: {
    name: 'CS2: FaZe vs Passion UA - Map 2 Winner',
    conditionId: '0x42b6312bfef1d4d996239fb2975a0201fed896beb9020c7117222cb9c63fb8a0',
    yesTokenId: '98500029478540181701955943314626655950009912089703692217392489784365890894034',
    noTokenId: '6600108613901488464286039277243478584438419930859899257744834420246596461241',
    outcomes: ['FaZe', 'Passion UA'],
  },
  bo3: {
    name: 'CS2: FaZe vs Passion UA (BO3)',
    conditionId: '0x5ac2e92a82ea41ec3a4d9332d323d8d198a8c9acc732b7e6373bd61f45e1df49',
    yesTokenId: '89062136554637645106569570664838812035010963361832797298254486917225439629146',
    noTokenId: '54956090965819006918015199317329813503156478664679332459223691084797135448319',
    outcomes: ['FaZe', 'Passion UA'],
  },
  cs2_b8_navi: {
    name: 'CS2: B8 vs Navi - Map 2 Winner',
    conditionId: '0xed4f4efc641b2cc65d172115527298780c2763e38392411080446d00624de188',
    yesTokenId: '98356217078946559304776425059619763149078508549007892630440851408503070133487',
    noTokenId: '9564639153871441133338469591798901837693814970886235799643024453135563888010',
    outcomes: ['B8', 'Natus Vincere'],
  },
};

// ============== Parse Arguments ==============
const args = process.argv.slice(2);
const EXECUTE_MERGE = args.includes('--merge');
const marketIdx = args.indexOf('--market');
const MARKET_KEY = marketIdx !== -1 ? args[marketIdx + 1] : 'all';

const PRIVATE_KEY = process.env.POLY_PRIVKEY || '';
const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

// ============== Main ==============
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              SETTLE POSITION - 清算脚本                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();

  if (!PRIVATE_KEY) {
    console.error('Error: POLY_PRIVKEY environment variable is required');
    process.exit(1);
  }

  // Initialize clients
  const ctf = new CTFClient({ privateKey: PRIVATE_KEY, rpcUrl: RPC_URL });

  console.log(`Wallet: ${ctf.getAddress()}`);
  console.log(`Mode: ${EXECUTE_MERGE ? 'MERGE (will execute)' : 'VIEW ONLY'}`);
  console.log();

  // Get USDC balance
  const usdcBalance = await ctf.getUsdcBalance();
  console.log(`USDC.e Balance: $${parseFloat(usdcBalance).toFixed(2)}`);
  console.log();

  // Process markets
  const marketsToProcess = MARKET_KEY === 'all'
    ? Object.entries(MARKETS)
    : [[MARKET_KEY, MARKETS[MARKET_KEY as keyof typeof MARKETS]]].filter(([_, m]) => m);

  if (marketsToProcess.length === 0) {
    console.error(`Unknown market: ${MARKET_KEY}`);
    console.log(`Available markets: ${Object.keys(MARKETS).join(', ')}`);
    process.exit(1);
  }

  let totalMerged = 0;
  let totalUnpairedYes = 0;
  let totalUnpairedNo = 0;

  for (const [key, market] of marketsToProcess) {
    if (!market) continue;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Market: ${market.name}`);
    console.log(`Condition: ${market.conditionId.slice(0, 20)}...`);
    console.log();

    // Get token balances
    const tokenIds = { yesTokenId: market.yesTokenId, noTokenId: market.noTokenId };
    const positions = await ctf.getPositionBalanceByTokenIds(market.conditionId, tokenIds);
    const yesBalance = parseFloat(positions.yesBalance);
    const noBalance = parseFloat(positions.noBalance);

    console.log(`  ${market.outcomes[0]} (YES): ${yesBalance.toFixed(6)}`);
    console.log(`  ${market.outcomes[1]} (NO):  ${noBalance.toFixed(6)}`);

    // Calculate pairs and unpaired
    const pairs = Math.min(yesBalance, noBalance);
    const unpairedYes = yesBalance - pairs;
    const unpairedNo = noBalance - pairs;

    console.log();
    console.log(`  Paired tokens: ${pairs.toFixed(6)} (can merge → $${pairs.toFixed(2)} USDC)`);

    if (unpairedYes > 0.001) {
      console.log(`  ⚠️ Unpaired YES: ${unpairedYes.toFixed(6)} (wait for market settlement to redeem if ${market.outcomes[0]} wins)`);
      totalUnpairedYes += unpairedYes;
    }
    if (unpairedNo > 0.001) {
      console.log(`  ⚠️ Unpaired NO: ${unpairedNo.toFixed(6)} (wait for market settlement to redeem if ${market.outcomes[1]} wins)`);
      totalUnpairedNo += unpairedNo;
    }

    // Execute merge if requested
    if (EXECUTE_MERGE && pairs >= 1) {
      const mergeAmount = Math.floor(pairs * 1e6) / 1e6;
      console.log();
      console.log(`  🔄 Merging ${mergeAmount.toFixed(6)} token pairs...`);

      try {
        // Use mergeByTokenIds to bypass the deprecated getPositionBalance check
        const result = await ctf.mergeByTokenIds(market.conditionId, tokenIds, mergeAmount.toString());
        console.log(`  ✅ Merge TX: ${result.txHash}`);
        console.log(`  ✅ Recovered: $${mergeAmount.toFixed(2)} USDC`);
        totalMerged += mergeAmount;
      } catch (error: any) {
        console.log(`  ❌ Merge failed: ${error.message}`);
      }
    } else if (pairs >= 1) {
      console.log();
      console.log(`  💡 Run with --merge to recover $${pairs.toFixed(2)} USDC`);
    }

    console.log();
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');

  if (EXECUTE_MERGE) {
    console.log(`Total Merged: $${totalMerged.toFixed(2)} USDC`);
    const newUsdcBalance = await ctf.getUsdcBalance();
    console.log(`New USDC.e Balance: $${parseFloat(newUsdcBalance).toFixed(2)}`);
  }

  if (totalUnpairedYes > 0.001 || totalUnpairedNo > 0.001) {
    console.log();
    console.log('Unpaired tokens (waiting for market settlement):');
    if (totalUnpairedYes > 0.001) {
      console.log(`  YES tokens: ${totalUnpairedYes.toFixed(6)}`);
    }
    if (totalUnpairedNo > 0.001) {
      console.log(`  NO tokens: ${totalUnpairedNo.toFixed(6)}`);
    }
    console.log();
    console.log('Note: Unpaired tokens can be redeemed after market settles');
    console.log('      - If your outcome wins: redeem for $1 per token');
    console.log('      - If your outcome loses: tokens have no value');
  }

  console.log();
}

main().catch(console.error);
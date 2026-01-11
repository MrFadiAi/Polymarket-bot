/**
 * Example 10: CTF (Conditional Token Framework) Operations
 *
 * Demonstrates on-chain CTF operations:
 * - Split: USDC → YES + NO tokens
 * - Merge: YES + NO → USDC (for arbitrage)
 * - Redeem: Winning tokens → USDC (after resolution)
 * - Balance queries and gas estimation
 *
 * ⚠️ CRITICAL: Polymarket CTF uses USDC.e (bridged), NOT native USDC!
 *
 * | Token         | Address                                    | CTF Compatible |
 * |---------------|--------------------------------------------|----------------|
 * | USDC.e        | 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 | ✅ Yes         |
 * | Native USDC   | 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 | ❌ No          |
 *
 * Common Mistake:
 * - Your wallet shows USDC balance in block explorers/wallets
 * - But CTF operations fail with "Insufficient USDC balance"
 * - This is because you have native USDC, not USDC.e
 *
 * Solution:
 * - Swap native USDC to USDC.e: SwapService.swap('USDC', 'USDC_E', amount)
 * - Or use SwapService.transferUsdcE() when funding wallets
 * - Use CTFClient.checkReadyForCTF() to verify before operations
 *
 * IMPORTANT: These are real on-chain transactions!
 * - Require MATIC for gas fees
 * - Require USDC.e (NOT native USDC) for split operations
 * - Test on small amounts first
 *
 * Set environment variables:
 * - POLYMARKET_PRIVATE_KEY: Your wallet private key
 * - POLYGON_RPC_URL: (optional) Custom RPC URL
 */

import {
  CTFClient,
  PolymarketSDK,
  RateLimiter,
  CTF_CONTRACT,
  USDC_CONTRACT,
  formatUSDC,
  checkArbitrage,
} from '../src/index.js';

// Configuration
const PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY || '0xYOUR_PRIVATE_KEY_HERE';
const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

async function main() {
  console.log('=== Polymarket CTF Operations ===\n');

  // Check if private key is set
  if (PRIVATE_KEY === '0xYOUR_PRIVATE_KEY_HERE') {
    console.log('WARNING: No private key set!');
    console.log('Set POLYMARKET_PRIVATE_KEY environment variable.');
    console.log('\nThis example will show CTF concepts without executing transactions.\n');
    await demonstrateConcepts();
    return;
  }

  // Initialize clients
  const ctf = new CTFClient({
    privateKey: PRIVATE_KEY,
    rpcUrl: RPC_URL,
  });

  const sdk = new PolymarketSDK();
  const rateLimiter = new RateLimiter();

  console.log(`Wallet: ${ctf.getAddress()}`);
  console.log(`CTF Contract: ${CTF_CONTRACT}`);
  console.log(`USDC Contract: ${USDC_CONTRACT}\n`);

  // ===== 1. Check CTF Readiness =====
  console.log('1. Checking CTF readiness (USDC.e + MATIC)...\n');

  try {
    const readiness = await ctf.checkReadyForCTF('10'); // Check for at least $10 USDC.e
    console.log(`   USDC.e Balance: $${readiness.usdcEBalance} (required for CTF)`);
    console.log(`   Native USDC:    $${readiness.nativeUsdcBalance} (NOT usable for CTF)`);
    console.log(`   MATIC Balance:  ${readiness.maticBalance} (for gas)`);
    console.log(`   CTF Ready:      ${readiness.ready ? '✅ Yes' : '❌ No'}`);
    if (readiness.suggestion) {
      console.log(`\n   ⚠️  ${readiness.suggestion}`);
    }
  } catch (error) {
    console.log(`   Error checking readiness: ${error}`);
  }

  // ===== 2. Find an Active Market =====
  console.log('\n2. Finding an active market with arbitrage potential...\n');

  const markets = await sdk.gammaApi.getMarkets({
    closed: false,
    active: true,
    limit: 10,
  });

  if (markets.length === 0) {
    console.log('   No active markets found');
    return;
  }

  // Find market with smallest spread (potential arb)
  let bestMarket = null;
  let bestOrderbook = null;

  for (const market of markets) {
    try {
      const orderbook = await sdk.markets.getProcessedOrderbook(market.conditionId);
      const askSum = orderbook.summary.askSum;

      console.log(`   ${market.question?.slice(0, 40)}...`);
      console.log(`   Ask Sum: ${askSum.toFixed(4)} | Long Arb: ${(orderbook.summary.longArbProfit * 100).toFixed(2)}%`);

      if (!bestOrderbook || askSum < bestOrderbook.summary.askSum) {
        bestMarket = market;
        bestOrderbook = orderbook;
      }
    } catch {
      // Skip markets without orderbook
    }
  }

  if (!bestMarket || !bestOrderbook) {
    console.log('   No suitable markets found');
    return;
  }

  console.log(`\n   Selected: ${bestMarket.question?.slice(0, 50)}...`);
  console.log(`   Condition ID: ${bestMarket.conditionId}`);

  // ===== 3. Check Token Balances =====
  console.log('\n3. Checking token balances...\n');

  try {
    const balances = await ctf.getPositionBalance(bestMarket.conditionId);
    console.log(`   YES Balance: ${balances.yesBalance}`);
    console.log(`   NO Balance: ${balances.noBalance}`);
    console.log(`   YES Position ID: ${balances.yesPositionId.slice(0, 20)}...`);
    console.log(`   NO Position ID: ${balances.noPositionId.slice(0, 20)}...`);
  } catch (error) {
    console.log(`   Error checking balances: ${error}`);
  }

  // ===== 4. Check Market Resolution =====
  console.log('\n4. Checking market resolution status...\n');

  try {
    const resolution = await ctf.getMarketResolution(bestMarket.conditionId);
    console.log(`   Is Resolved: ${resolution.isResolved}`);
    if (resolution.isResolved) {
      console.log(`   Winning Outcome: ${resolution.winningOutcome}`);
      console.log(`   Payout Numerators: [${resolution.payoutNumerators.join(', ')}]`);
      console.log(`   Payout Denominator: ${resolution.payoutDenominator}`);
    }
  } catch (error) {
    console.log(`   Error checking resolution: ${error}`);
  }

  // ===== 5. Arbitrage Analysis =====
  console.log('\n5. Arbitrage Analysis...\n');

  const arb = checkArbitrage(
    bestOrderbook.yes.ask,
    bestOrderbook.no.ask,
    bestOrderbook.yes.bid,
    bestOrderbook.no.bid
  );

  if (arb) {
    console.log(`   ARBITRAGE DETECTED!`);
    console.log(`   Type: ${arb.type.toUpperCase()}`);
    console.log(`   Profit: ${(arb.profit * 100).toFixed(2)}%`);

    if (arb.type === 'long') {
      console.log(`\n   Strategy (Long Arb):`);
      console.log(`   1. Buy YES @ $${bestOrderbook.yes.ask.toFixed(4)}`);
      console.log(`   2. Buy NO @ $${bestOrderbook.no.ask.toFixed(4)}`);
      console.log(`   3. CTF Merge → 1 USDC per pair`);
      console.log(`   Total cost: $${bestOrderbook.summary.askSum.toFixed(4)} per pair`);
      console.log(`   Profit: $${arb.profit.toFixed(4)} per pair`);
    } else {
      console.log(`\n   Strategy (Short Arb):`);
      console.log(`   1. CTF Split $1 USDC → 1 YES + 1 NO`);
      console.log(`   2. Sell YES @ $${bestOrderbook.yes.bid.toFixed(4)}`);
      console.log(`   3. Sell NO @ $${bestOrderbook.no.bid.toFixed(4)}`);
      console.log(`   Total revenue: $${bestOrderbook.summary.bidSum.toFixed(4)} per pair`);
      console.log(`   Profit: $${arb.profit.toFixed(4)} per pair`);
    }
  } else {
    console.log(`   No arbitrage opportunity`);
    console.log(`   Ask Sum: $${bestOrderbook.summary.askSum.toFixed(4)} (need < $1 for long arb)`);
    console.log(`   Bid Sum: $${bestOrderbook.summary.bidSum.toFixed(4)} (need > $1 for short arb)`);
  }

  // ===== 6. Gas Estimation =====
  console.log('\n6. Gas Estimation...\n');

  try {
    const splitGas = await ctf.estimateSplitGas(bestMarket.conditionId, '100');
    const mergeGas = await ctf.estimateMergeGas(bestMarket.conditionId, '100');
    console.log(`   Split 100 USDC: ~${splitGas} gas`);
    console.log(`   Merge 100 pairs: ~${mergeGas} gas`);
    console.log(`   At ~30 gwei, costs ~$${(parseInt(splitGas) * 30 / 1e9 * 0.5).toFixed(4)} per operation`);
  } catch (error) {
    console.log(`   Error estimating gas: ${error}`);
  }

  // ===== 7. CTF Operation Examples (Not Executed) =====
  console.log('\n7. CTF Operation Examples (Not Executed)\n');

  console.log('   --- SPLIT (USDC → Tokens) ---');
  console.log(`
   // Split 100 USDC into 100 YES + 100 NO
   const splitResult = await ctf.split(conditionId, '100');
   console.log(\`TX: \${splitResult.txHash}\`);
   console.log(\`Created \${splitResult.yesTokens} YES + \${splitResult.noTokens} NO\`);
`);

  console.log('   --- MERGE (Tokens → USDC) ---');
  console.log(`
   // Merge 100 YES + 100 NO → 100 USDC
   const mergeResult = await ctf.merge(conditionId, '100');
   console.log(\`TX: \${mergeResult.txHash}\`);
   console.log(\`Received \${mergeResult.usdcReceived} USDC\`);
`);

  console.log('   --- REDEEM (After Resolution) ---');
  console.log(`
   // Redeem winning tokens after market resolves
   const redeemResult = await ctf.redeem(conditionId);
   console.log(\`TX: \${redeemResult.txHash}\`);
   console.log(\`Redeemed \${redeemResult.tokensRedeemed} \${redeemResult.outcome}\`);
   console.log(\`Received \${redeemResult.usdcReceived} USDC\`);
`);

  // ===== 8. Full Arbitrage Flow =====
  console.log('8. Full Arbitrage Flow Example\n');

  console.log(`
   // Assuming long arbitrage opportunity exists
   // 1. Buy YES tokens via TradingService
   const yesOrder = await tradingService.createMarketOrder({
     tokenId: yesTokenId,
     side: 'BUY',
     amount: 100, // $100 USDC
     orderType: 'FOK',
   });

   // 2. Buy NO tokens via TradingService
   const noOrder = await tradingService.createMarketOrder({
     tokenId: noTokenId,
     side: 'BUY',
     amount: 100, // $100 USDC
     orderType: 'FOK',
   });

   // 3. Merge tokens via CTFClient
   // Calculate min(yesTokens, noTokens) to merge
   const tokensToMerge = Math.min(yesTokensReceived, noTokensReceived);
   const mergeResult = await ctf.merge(conditionId, tokensToMerge.toString());

   // 4. Profit = USDC received - total spent
   console.log(\`Profit: \${mergeResult.usdcReceived - totalSpent}\`);
`);

  console.log('\n=== Example Complete ===');
}

async function demonstrateConcepts() {
  console.log('--- CTF Concepts Demonstration ---\n');

  console.log('Polymarket uses the Gnosis Conditional Token Framework (CTF).\n');

  console.log('Core Operations:');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ SPLIT:  $1 USDC  →  1 YES token  +  1 NO token             │');
  console.log('│ MERGE:  1 YES + 1 NO  →  $1 USDC                           │');
  console.log('│ REDEEM: After resolution, winning tokens → $1 USDC each    │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  console.log('Arbitrage Use Cases:');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ LONG ARB (askSum < $1):                                     │');
  console.log('│   1. Buy YES @ $0.48 + NO @ $0.50 = $0.98 cost             │');
  console.log('│   2. CTF Merge → $1 USDC                                   │');
  console.log('│   3. Profit: $0.02 per pair (2%)                           │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│ SHORT ARB (bidSum > $1):                                    │');
  console.log('│   1. CTF Split $1 → 1 YES + 1 NO                           │');
  console.log('│   2. Sell YES @ $0.52 + NO @ $0.50 = $1.02 revenue         │');
  console.log('│   3. Profit: $0.02 per pair (2%)                           │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  console.log('Market Making Use Case:');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ If you sell too many YES tokens and need inventory:        │');
  console.log('│   1. CTF Split $1000 → 1000 YES + 1000 NO                  │');
  console.log('│   2. Sell the NO tokens on market                          │');
  console.log('│   3. Use YES tokens to continue market making              │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  console.log('Contract Addresses (Polygon):');
  console.log(`  CTF:  ${CTF_CONTRACT}`);
  console.log(`  USDC: ${USDC_CONTRACT}\n`);

  console.log('Gas Costs:');
  console.log('  Split/Merge/Redeem: ~200,000-300,000 gas');
  console.log('  At ~30 gwei, ~$0.003-0.005 per operation\n');

  console.log('⚠️  IMPORTANT: USDC.e vs Native USDC');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ Polymarket CTF ONLY accepts USDC.e (bridged USDC)          │');
  console.log('│                                                             │');
  console.log('│ USDC.e:      0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 ✅  │');
  console.log('│ Native USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 ❌  │');
  console.log('│                                                             │');
  console.log('│ If you have native USDC, swap to USDC.e first:             │');
  console.log('│   SwapService.swap("USDC", "USDC_E", amount)               │');
  console.log('│                                                             │');
  console.log('│ When funding wallets for CTF, use:                         │');
  console.log('│   SwapService.transferUsdcE(to, amount)                    │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  console.log('To run actual CTF operations:');
  console.log('  1. Set POLYMARKET_PRIVATE_KEY environment variable');
  console.log('  2. Ensure wallet has USDC.e on Polygon (NOT native USDC!)');
  console.log('  3. Ensure wallet has MATIC for gas');
  console.log('  4. Run this example again\n');
}

main().catch(console.error);

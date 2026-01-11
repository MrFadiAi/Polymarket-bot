#!/usr/bin/env npx tsx
/**
 * FaZe vs Passion UA - BO3 Match Winner Arbitrage Monitor (V2 - Instant Merge)
 *
 * V2 策略：配合 token-rebalancer.ts 使用
 * - Long Arb: Buy YES + NO → 立即 Merge（因为账户预存了 tokens）
 * - Short Arb: 直接卖出预存的 tokens
 * - Rebalancer 自动补充 tokens，确保随时有流动性
 *
 * Usage:
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/faze-bo3-arb.ts
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/faze-bo3-arb.ts --auto-execute
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/faze-bo3-arb.ts --auto-execute --threshold 0.003
 */

import {
    RealtimeServiceV2,
    CTFClient,
    TradingService,
    RateLimiter,
    createUnifiedCache,
    type TokenIds,
  } from '../../src/index.js';
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // MARKET CONFIGURATION - FaZe vs Passion UA BO3 Match Winner
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const MARKET_CONFIG = {
    name: 'CS2: FaZe vs Passion UA (BO3)',
    conditionId: '0x5ac2e92a82ea41ec3a4d9332d323d8d198a8c9acc732b7e6373bd61f45e1df49',
    outcomes: ['FaZe', 'Passion UA'],
    yesTokenId: '89062136554637645106569570664838812035010963361832797298254486917225439629146',
    noTokenId: '54956090965819006918015199317329813503156478664679332459223691084797135448319',
  };
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const PRIVATE_KEY = process.env.POLY_PRIVKEY || process.env.POLYMARKET_PRIVATE_KEY || '';
  const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
  
  const args = process.argv.slice(2);
  const AUTO_EXECUTE = args.includes('--auto-execute');
  const thresholdIdx = args.indexOf('--threshold');
  const PROFIT_THRESHOLD = thresholdIdx !== -1 ? parseFloat(args[thresholdIdx + 1]) : 0.005;
  const MIN_SIZE = 5;
  const MAX_SINGLE_TRADE = 100;
  const MIN_TOKEN_RESERVE = 10;
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  interface OrderbookState {
    yesBids: Array<{ price: number; size: number }>;
    yesAsks: Array<{ price: number; size: number }>;
    noBids: Array<{ price: number; size: number }>;
    noAsks: Array<{ price: number; size: number }>;
    lastUpdate: number;
  }
  
  interface BalanceState {
    usdc: number;
    yesTokens: number;
    noTokens: number;
    lastUpdate: number;
  }
  
  let orderbook: OrderbookState = {
    yesBids: [],
    yesAsks: [],
    noBids: [],
    noAsks: [],
    lastUpdate: 0,
  };
  
  let balance: BalanceState = {
    usdc: 0,
    yesTokens: 0,
    noTokens: 0,
    lastUpdate: 0,
  };
  
  let realtimeService: RealtimeServiceV2;
  let ctf: CTFClient | null = null;
  let tradingService: TradingService | null = null;
  
  let isExecuting = false;
  let lastArbCheck = 0;
  let totalOpportunities = 0;
  let totalExecuted = 0;
  let totalProfit = 0;
  
  const tokenIds: TokenIds = {
    yesTokenId: MARKET_CONFIG.yesTokenId,
    noTokenId: MARKET_CONFIG.noTokenId,
  };
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════════════════════════════
  
  async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║       FAZE vs PASSION UA - BO3 ARBITRAGE (V2 INSTANT)          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Market: ${MARKET_CONFIG.name}`);
    console.log(`Outcomes: ${MARKET_CONFIG.outcomes[0]} (YES) vs ${MARKET_CONFIG.outcomes[1]} (NO)`);
    console.log(`Condition ID: ${MARKET_CONFIG.conditionId.slice(0, 20)}...`);
    console.log(`Profit Threshold: ${(PROFIT_THRESHOLD * 100).toFixed(2)}%`);
    console.log(`Auto Execute: ${AUTO_EXECUTE ? 'YES' : 'NO'}`);
    console.log(`Strategy: INSTANT MERGE (with Rebalancer support)`);
    console.log('');
  
    const rateLimiter = new RateLimiter();
    const cache = createUnifiedCache();

    if (PRIVATE_KEY) {
      ctf = new CTFClient({ privateKey: PRIVATE_KEY, rpcUrl: RPC_URL });
      console.log(`Wallet: ${ctf.getAddress()}`);

      tradingService = new TradingService(rateLimiter, cache, { privateKey: PRIVATE_KEY, chainId: 137 });
      await tradingService.initialize();
      console.log('Trading service initialized');
  
      await updateBalance();
      console.log(`USDC.e Balance: ${balance.usdc.toFixed(2)}`);
      console.log(`YES Tokens: ${balance.yesTokens.toFixed(2)}`);
      console.log(`NO Tokens: ${balance.noTokens.toFixed(2)}`);
  
      const heldPairs = Math.min(balance.yesTokens, balance.noTokens);
      if (heldPairs < MIN_TOKEN_RESERVE) {
        console.log(`\n⚠️  Token reserve low (${heldPairs.toFixed(0)} < ${MIN_TOKEN_RESERVE})`);
        console.log(`   Run token-rebalancer.ts to auto-split tokens`);
      }
    } else {
      console.log('No wallet configured - monitoring only');
    }
  
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Connecting to WebSocket...');
    console.log('');

    realtimeService = new RealtimeServiceV2({ debug: false });

    // Wait for connection
    const connectedPromise = new Promise<void>((resolve) => {
      realtimeService.once('connected', resolve);
    });

    realtimeService.connect();
    await connectedPromise;
    console.log('WebSocket connected');

    // Subscribe to markets
    realtimeService.subscribeMarkets([MARKET_CONFIG.yesTokenId, MARKET_CONFIG.noTokenId], {
      onOrderbook: handleBookUpdate,
      onError: (error) => console.error('WebSocket error:', error.message),
    });
    console.log(`Subscribed to ${MARKET_CONFIG.outcomes[0]} and ${MARKET_CONFIG.outcomes[1]} tokens`);

    setInterval(updateBalance, 30000);

    process.on('SIGINT', async () => {
      console.log('\n\nShutting down...');
      console.log(`Total opportunities: ${totalOpportunities}, Executed: ${totalExecuted}, Profit: $${totalProfit.toFixed(2)}`);
      realtimeService.disconnect();
      process.exit(0);
    });
  
    console.log('Monitoring for arbitrage opportunities...\n');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // BALANCE & ORDERBOOK
  // ═══════════════════════════════════════════════════════════════════════════════
  
  async function updateBalance() {
    if (!ctf) return;
    try {
      const [usdcBalance, positions] = await Promise.all([
        ctf.getUsdcBalance(),
        ctf.getPositionBalanceByTokenIds(MARKET_CONFIG.conditionId, tokenIds),
      ]);
      balance.usdc = parseFloat(usdcBalance);
      balance.yesTokens = parseFloat(positions.yesBalance);
      balance.noTokens = parseFloat(positions.noBalance);
      balance.lastUpdate = Date.now();
    } catch (error) {
      console.error('Failed to update balance:', (error as Error).message);
    }
  }
  
  function handleBookUpdate(update: { assetId: string; bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> }) {
    const { assetId, bids, asks } = update;
    // Convert string prices/sizes to numbers
    const parsedBids = bids.map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
    const parsedAsks = asks.map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));

    if (assetId === MARKET_CONFIG.yesTokenId) {
      orderbook.yesBids = parsedBids.sort((a, b) => b.price - a.price);
      orderbook.yesAsks = parsedAsks.sort((a, b) => a.price - b.price);
    } else if (assetId === MARKET_CONFIG.noTokenId) {
      orderbook.noBids = parsedBids.sort((a, b) => b.price - a.price);
      orderbook.noAsks = parsedAsks.sort((a, b) => a.price - b.price);
    }
    orderbook.lastUpdate = Date.now();
    checkArbitrage();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // ARBITRAGE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function checkArbitrage() {
    const now = Date.now();
    if (now - lastArbCheck < 10) return;
    lastArbCheck = now;
  
    if (orderbook.yesBids.length === 0 || orderbook.noAsks.length === 0) return;
  
    const yesBestBid = orderbook.yesBids[0]?.price || 0;
    const yesBestAsk = orderbook.yesAsks[0]?.price || 1;
    const noBestBid = orderbook.noBids[0]?.price || 0;
    const noBestAsk = orderbook.noAsks[0]?.price || 1;
  
    const effectiveBuyYes = Math.min(yesBestAsk, 1 - noBestBid);
    const effectiveBuyNo = Math.min(noBestAsk, 1 - yesBestBid);
    const effectiveSellYes = Math.max(yesBestBid, 1 - noBestAsk);
    const effectiveSellNo = Math.max(noBestBid, 1 - yesBestAsk);
  
    const longCost = effectiveBuyYes + effectiveBuyNo;
    const longProfit = 1 - longCost;
    const shortRevenue = effectiveSellYes + effectiveSellNo;
    const shortProfit = shortRevenue - 1;
  
    const orderbookLongSize = Math.min(orderbook.yesAsks[0]?.size || 0, orderbook.noAsks[0]?.size || 0);
    const orderbookShortSize = Math.min(orderbook.yesBids[0]?.size || 0, orderbook.noBids[0]?.size || 0);
  
    const heldPairs = Math.min(balance.yesTokens, balance.noTokens);
    const balanceLongSize = longCost > 0 ? balance.usdc / longCost : 0;
    const longSize = Math.min(orderbookLongSize, balanceLongSize, MAX_SINGLE_TRADE);
    const shortSize = Math.min(orderbookShortSize, heldPairs, MAX_SINGLE_TRADE);
  
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const status = [
      `[${timestamp}]`,
      `${MARKET_CONFIG.outcomes[0]}: ${yesBestBid.toFixed(2)}/${yesBestAsk.toFixed(2)}`,
      `${MARKET_CONFIG.outcomes[1]}: ${noBestBid.toFixed(2)}/${noBestAsk.toFixed(2)}`,
      `Long: ${(longProfit * 100).toFixed(2)}%`,
      `Short: ${(shortProfit * 100).toFixed(2)}%`,
      `Bal: $${balance.usdc.toFixed(0)}`,
      `Pairs: ${heldPairs.toFixed(0)}`,
    ].join(' | ');
  
    const hasLongArb = longProfit > PROFIT_THRESHOLD && longSize >= MIN_SIZE && balance.usdc >= MIN_SIZE;
    const hasShortArb = shortProfit > PROFIT_THRESHOLD && shortSize >= MIN_SIZE && heldPairs >= MIN_TOKEN_RESERVE;
  
    if (hasLongArb || hasShortArb) {
      console.log('\n' + '!'.repeat(75));
      console.log(status);
  
      if (hasLongArb) {
        totalOpportunities++;
        console.log(`\n🎯 LONG ARB: Buy ${MARKET_CONFIG.outcomes[0]} @ ${effectiveBuyYes.toFixed(4)} + ${MARKET_CONFIG.outcomes[1]} @ ${effectiveBuyNo.toFixed(4)}`);
        console.log(`   Cost: ${longCost.toFixed(4)}, Profit: ${(longProfit * 100).toFixed(2)}%, Size: ${longSize.toFixed(2)}, Est: $${(longProfit * longSize).toFixed(2)}`);
        if (AUTO_EXECUTE && !isExecuting) executeLongArb(effectiveBuyYes, effectiveBuyNo, longSize, longProfit);
      }
  
      if (hasShortArb) {
        totalOpportunities++;
        console.log(`\n🎯 SHORT ARB: Sell ${MARKET_CONFIG.outcomes[0]} @ ${effectiveSellYes.toFixed(4)} + ${MARKET_CONFIG.outcomes[1]} @ ${effectiveSellNo.toFixed(4)}`);
        console.log(`   Revenue: ${shortRevenue.toFixed(4)}, Profit: ${(shortProfit * 100).toFixed(2)}%, Size: ${shortSize.toFixed(2)}, Est: $${(shortProfit * shortSize).toFixed(2)}`);
        if (AUTO_EXECUTE && !isExecuting) executeShortArb(shortSize, shortProfit * shortSize);
      }
  
      console.log('!'.repeat(75) + '\n');
    } else {
      process.stdout.write('\r' + status + '    ');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════════
  
  async function executeLongArb(buyYesPrice: number, buyNoPrice: number, size: number, profitRate: number) {
    if (!ctf || !tradingService || isExecuting) return;
    isExecuting = true;
    const startTime = Date.now();
    console.log('\n🔄 Executing Long Arb (Buy → Instant Merge)...');
  
    try {
      const requiredUsdc = (buyYesPrice + buyNoPrice) * size;
      if (balance.usdc < requiredUsdc) {
        console.log(`❌ Insufficient USDC.e: have ${balance.usdc.toFixed(2)}, need ${requiredUsdc.toFixed(2)}`);
        isExecuting = false;
        return;
      }
  
      console.log(`   1. Buying tokens in parallel...`);
      const orderStartTime = Date.now();
      const [buyYesResult, buyNoResult] = await Promise.all([
        tradingService.createMarketOrder({ tokenId: MARKET_CONFIG.yesTokenId, side: 'BUY', amount: size * buyYesPrice, orderType: 'FOK' }),
        tradingService.createMarketOrder({ tokenId: MARKET_CONFIG.noTokenId, side: 'BUY', amount: size * buyNoPrice, orderType: 'FOK' }),
      ]);
      console.log(`      ${MARKET_CONFIG.outcomes[0]}: ${buyYesResult.success ? '✓' : '✗'}, ${MARKET_CONFIG.outcomes[1]}: ${buyNoResult.success ? '✓' : '✗'} (${Date.now() - orderStartTime}ms)`);
  
      if (!buyYesResult.success || !buyNoResult.success) {
        console.log(`❌ Order(s) failed - will retry on next opportunity`);
        if (buyYesResult.errorMsg) console.log(`   YES Error: ${buyYesResult.errorMsg}`);
        if (buyNoResult.errorMsg) console.log(`   NO Error: ${buyNoResult.errorMsg}`);
        isExecuting = false;
        return;
      }
  
      // Immediate merge using pre-held tokens
      const heldPairs = Math.min(balance.yesTokens, balance.noTokens);
      const mergeSize = Math.floor(Math.min(size, heldPairs) * 1e6) / 1e6;
  
      if (mergeSize >= MIN_SIZE) {
        console.log(`   2. Merging ${mergeSize.toFixed(2)} pairs from pre-held tokens...`);
        try {
          const mergeResult = await ctf.merge(MARKET_CONFIG.conditionId, mergeSize.toString());
          console.log(`      TX: ${mergeResult.txHash}`);
  
          const estProfit = profitRate * mergeSize;
          totalProfit += estProfit;
          console.log(`✅ Long Arb completed! Profit: ~$${estProfit.toFixed(2)}. Total: ${Date.now() - startTime}ms`);
        } catch (mergeError: any) {
          console.log(`   ⚠️ Merge failed: ${mergeError.message}`);
          console.log(`   Tokens will be held for later merge by rebalancer`);
        }
      } else {
        console.log(`   2. Skipping merge (held pairs ${heldPairs.toFixed(2)} < ${MIN_SIZE})`);
        console.log(`   Tokens held - rebalancer will merge later`);
      }
  
      totalExecuted++;
      await new Promise(r => setTimeout(r, 2000));
      await updateBalance();
      console.log(`   New balance: USDC=${balance.usdc.toFixed(2)}, YES=${balance.yesTokens.toFixed(2)}, NO=${balance.noTokens.toFixed(2)}`);
    } catch (error) {
      console.log(`❌ Long Arb failed: ${(error as Error).message}`);
    }
    isExecuting = false;
  }
  
  async function executeShortArb(size: number, estProfit: number) {
    if (!ctf || !tradingService || isExecuting) return;
    isExecuting = true;
    const startTime = Date.now();
    console.log('\n🔄 Executing Short Arb (Sell Pre-held Tokens)...');
  
    try {
      const heldPairs = Math.min(balance.yesTokens, balance.noTokens);
      if (heldPairs < size) {
        console.log(`❌ Insufficient held tokens: have ${heldPairs.toFixed(2)}, need ${size.toFixed(2)}`);
        console.log(`   Run token-rebalancer.ts to auto-split more tokens`);
        isExecuting = false;
        return;
      }
  
      console.log(`   1. Selling pre-held tokens in parallel...`);
      const orderStartTime = Date.now();
      const [sellYesResult, sellNoResult] = await Promise.all([
        tradingService.createMarketOrder({ tokenId: MARKET_CONFIG.yesTokenId, side: 'SELL', amount: size, orderType: 'FOK' }),
        tradingService.createMarketOrder({ tokenId: MARKET_CONFIG.noTokenId, side: 'SELL', amount: size, orderType: 'FOK' }),
      ]);
      console.log(`      ${MARKET_CONFIG.outcomes[0]}: ${sellYesResult.success ? '✓' : '✗'}, ${MARKET_CONFIG.outcomes[1]}: ${sellNoResult.success ? '✓' : '✗'} (${Date.now() - orderStartTime}ms)`);
  
      if (!sellYesResult.success || !sellNoResult.success) {
        console.log(`❌ Order(s) failed`);
        if (sellYesResult.errorMsg) console.log(`   YES Error: ${sellYesResult.errorMsg}`);
        if (sellNoResult.errorMsg) console.log(`   NO Error: ${sellNoResult.errorMsg}`);
        isExecuting = false;
        return;
      }
  
      console.log(`✅ Short Arb completed! Profit: ~$${estProfit.toFixed(2)}. Total: ${Date.now() - startTime}ms`);
      totalExecuted++;
      totalProfit += estProfit;
  
      await new Promise(r => setTimeout(r, 2000));
      await updateBalance();
      console.log(`   New balance: USDC=${balance.usdc.toFixed(2)}, YES=${balance.yesTokens.toFixed(2)}, NO=${balance.noTokens.toFixed(2)}`);
  
      const newHeldPairs = Math.min(balance.yesTokens, balance.noTokens);
      if (newHeldPairs < MIN_TOKEN_RESERVE) {
        console.log(`   ⚠️ Token reserve low (${newHeldPairs.toFixed(0)}) - rebalancer should split more`);
      }
    } catch (error) {
      console.log(`❌ Short Arb failed: ${(error as Error).message}`);
    }
    isExecuting = false;
  }
  
  main().catch(console.error);
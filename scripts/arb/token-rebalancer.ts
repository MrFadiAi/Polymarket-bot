#!/usr/bin/env npx tsx
/**
 * Token Rebalancer V2 - 动态平衡 USDC 和 Token 的持有量
 *
 * 核心功能:
 * 1. 维持 USDC + Token 的目标比例
 * 2. ⚠️ 关键：保持 YES 和 NO 数量一致，避免风险敞口
 *
 * 资金模型:
 * - 1 USDC split → 1 YES + 1 NO
 * - 1 YES + 1 NO merge → 1 USDC
 * - 所以 N YES + N NO 配对价值 = N USDC
 *
 * 策略 (以 50% USDC 为例, 1000u 总资金):
 * - 500 USDC (50%)
 * - 500 YES + 500 NO (配对价值 = 500 USDC)
 * - 总价值 = 500 + 500 = 1000 USDC
 *
 * - Token 不足时自动 Split 补充
 * - Token 过多时自动 Merge 回收
 * - YES ≠ NO 时，卖出多余的一方来平衡
 *
 * 用法:
 *   POLY_PRIVKEY=0x... npx tsx scripts/v2/token-rebalancer.ts [options]
 *
 * Options:
 *   --condition <id>       Condition ID
 *   --yes-token <id>       YES token ID
 *   --no-token <id>        NO token ID
 *   --total <amount>       Total capital in USDC (default: auto-detect)
 *   --usdc-ratio <n>       USDC ratio 0-1 (default: 0.5)
 *   --interval <ms>        Check interval in ms (default: 5000)
 *   --threshold <n>        Rebalance threshold 0-1 (default: 0.2)
 *   --imbalance-threshold  Max YES/NO difference before fix (default: 5)
 *   --dry-run              Show what would happen without executing
 */

import {
    CTFClient,
    TradingService,
    RateLimiter,
    createUnifiedCache,
  } from '../../src/index.js';
  
  // ============== Market Configuration ==============
  // Default: FaZe vs Passion UA - Map 2 Winner
  const DEFAULT_CONFIG = {
    conditionId: '0x42b6312bfef1d4d996239fb2975a0201fed896beb9020c7117222cb9c63fb8a0',
    yesTokenId: '98500029478540181701955943314626655950009912089703692217392489784365890894034',
    noTokenId: '6600108613901488464286039277243478584438419930859899257744834420246596461241',
    name: 'FaZe vs Passion UA - Map 2'
  };
  
  // ============== Parse Arguments ==============
  const args = process.argv.slice(2);
  
  function getArg(name: string, defaultValue?: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1]) {
      return args[idx + 1];
    }
    return defaultValue;
  }
  
  const CONDITION_ID = getArg('condition', DEFAULT_CONFIG.conditionId)!;
  const YES_TOKEN_ID = getArg('yes-token', DEFAULT_CONFIG.yesTokenId)!;
  const NO_TOKEN_ID = getArg('no-token', DEFAULT_CONFIG.noTokenId)!;
  const TOTAL_CAPITAL = getArg('total') ? parseFloat(getArg('total')!) : undefined;
  const USDC_RATIO = parseFloat(getArg('usdc-ratio', '0.5')!);
  const CHECK_INTERVAL = parseInt(getArg('interval', '5000')!);
  const REBALANCE_THRESHOLD = parseFloat(getArg('threshold', '0.2')!);
  const IMBALANCE_THRESHOLD = parseFloat(getArg('imbalance-threshold', '5')!);
  const DRY_RUN = args.includes('--dry-run');
  
  // Token ratio: YES and NO should each equal the non-USDC portion
  // Because: 1 USDC = 1 YES + 1 NO, so paired tokens (N YES + N NO) = N USDC value
  // Example with 1000u total and 50% USDC:
  //   - 500 USDC
  //   - 500 YES + 500 NO (paired value = 500 USDC)
  //   - Total value = 500 + 500 = 1000 USDC
  const TOKEN_RATIO = 1 - USDC_RATIO;
  
  // Minimum amounts
  const MIN_REBALANCE_AMOUNT = 5;
  const MIN_SELL_AMOUNT = 5;
  
  // ============== State ==============
  interface Balance {
    usdc: number;
    yes: number;
    no: number;
    total: number;
  }
  
  type ActionType = 'split' | 'merge' | 'sell_yes' | 'sell_no' | 'none';
  
  interface RebalanceAction {
    type: ActionType;
    amount: number;
    reason: string;
    priority: number; // Higher = more urgent
  }
  
  // ============== Main ==============
  async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║              TOKEN REBALANCER V2 (with Risk Control)           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log();
  
    // Initialize clients
    const privateKey = process.env.POLY_PRIVKEY;
    if (!privateKey) {
      console.error('Error: POLY_PRIVKEY environment variable is required');
      process.exit(1);
    }
  
    const ctf = new CTFClient({
      privateKey,
      rpcUrl: 'https://polygon-rpc.com',
    });
  
    // Initialize trading service for selling excess tokens
    const rateLimiter = new RateLimiter();
    const cache = createUnifiedCache();
    const tradingService = new TradingService(rateLimiter, cache, {
      privateKey,
      chainId: 137,
    });
    await tradingService.initialize();
  
    console.log(`Wallet: ${ctf.getAddress()}`);
    console.log(`Condition: ${CONDITION_ID.slice(0, 20)}...`);
    console.log(`Target: ${(USDC_RATIO * 100).toFixed(0)}% USDC + ${(TOKEN_RATIO * 100).toFixed(0)}% Tokens (${(TOKEN_RATIO * 100).toFixed(0)} YES + ${(TOKEN_RATIO * 100).toFixed(0)} NO paired)`);
    console.log(`Rebalance Threshold: ${(REBALANCE_THRESHOLD * 100).toFixed(0)}%`);
    console.log(`Imbalance Threshold: ${IMBALANCE_THRESHOLD} tokens (YES must equal NO)`);
    console.log(`Check Interval: ${CHECK_INTERVAL}ms`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no execution)' : 'LIVE'}`);
    console.log();
  
    // Get initial balance
    const balance = await getBalance(ctf, tradingService);
    const totalCapital = TOTAL_CAPITAL || balance.total;
  
    console.log(`Total Capital: $${totalCapital.toFixed(2)}`);
    console.log(`Initial: USDC=${balance.usdc.toFixed(2)} YES=${balance.yes.toFixed(2)} NO=${balance.no.toFixed(2)}`);
  
    const initialImbalance = Math.abs(balance.yes - balance.no);
    if (initialImbalance > IMBALANCE_THRESHOLD) {
      console.log(`\n⚠️  WARNING: Token imbalance detected! YES-NO=${(balance.yes - balance.no).toFixed(2)}`);
      console.log(`   This creates risk exposure. Will auto-fix by selling excess tokens.`);
    }
  
    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Starting rebalancer loop...');
    console.log();
  
    // Main loop
    let lastActionTime = 0;
    const MIN_ACTION_INTERVAL = 10000; // Wait at least 10s between actions
    const CONFIRM_DELAY = 5000; // Wait 5s before confirming imbalance action
    const BALANCE_CHANGE_THRESHOLD = 1; // If balance changes by more than this, reset confirmation
    let pendingImbalanceAction: RebalanceAction | null = null;
    let pendingImbalanceTime = 0;
    let lastConfirmBalance: Balance | null = null;
  
    while (true) {
      try {
        const currentBalance = await getBalance(ctf, tradingService);
        const actions = calculateRebalanceActions(currentBalance, totalCapital);
  
        // Get highest priority action
        const action = actions.sort((a, b) => b.priority - a.priority)[0];
  
        // Display status
        const usdcPct = (currentBalance.usdc / totalCapital * 100).toFixed(1);
        const yesPct = (currentBalance.yes / totalCapital * 100).toFixed(1);
        const noPct = (currentBalance.no / totalCapital * 100).toFixed(1);
        const imbalance = currentBalance.yes - currentBalance.no;
        const imbalanceStr = imbalance >= 0 ? `+${imbalance.toFixed(1)}` : imbalance.toFixed(1);
  
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const statusLine = `[${timestamp}] USDC: $${currentBalance.usdc.toFixed(0)} (${usdcPct}%) | YES: ${currentBalance.yes.toFixed(0)} (${yesPct}%) | NO: ${currentBalance.no.toFixed(0)} (${noPct}%) | Δ: ${imbalanceStr} | ${action.type}`;
  
        process.stdout.write(`\r${statusLine.padEnd(130)}`);
  
        // Execute action if needed
        if (action.type !== 'none' && action.amount >= MIN_SELL_AMOUNT) {
          const now = Date.now();
          if (now - lastActionTime < MIN_ACTION_INTERVAL) {
            await sleep(CHECK_INTERVAL);
            continue;
          }
  
          // For imbalance actions (sell_yes/sell_no), require confirmation after delay
          // This prevents reacting to temporary imbalance during CLOB settlement
          if (action.type === 'sell_yes' || action.type === 'sell_no') {
            // Check if balance has changed significantly since last check
            const balanceChanged = lastConfirmBalance && (
              Math.abs(currentBalance.yes - lastConfirmBalance.yes) > BALANCE_CHANGE_THRESHOLD ||
              Math.abs(currentBalance.no - lastConfirmBalance.no) > BALANCE_CHANGE_THRESHOLD
            );
  
            if (!pendingImbalanceAction || pendingImbalanceAction.type !== action.type || balanceChanged) {
              // New imbalance detected or balance changed, (re)start waiting
              if (balanceChanged && pendingImbalanceAction) {
                console.log(`\n⚠️ Balance changed during confirmation, restarting ${CONFIRM_DELAY/1000}s wait...`);
              } else if (!pendingImbalanceAction) {
                console.log(`\n⏳ Imbalance detected (${action.type}), waiting ${CONFIRM_DELAY/1000}s to confirm...`);
              }
              pendingImbalanceAction = action;
              pendingImbalanceTime = now;
              lastConfirmBalance = { ...currentBalance };
              await sleep(CHECK_INTERVAL);
              continue;
            } else if (now - pendingImbalanceTime < CONFIRM_DELAY) {
              // Still waiting for confirmation
              await sleep(CHECK_INTERVAL);
              continue;
            }
            // Confirmed - imbalance persisted for CONFIRM_DELAY with stable balance, proceed with action
            console.log(`\n✓ Imbalance confirmed after ${CONFIRM_DELAY/1000}s delay (balance stable)`);
            pendingImbalanceAction = null;
            lastConfirmBalance = null;
          }
  
          console.log(); // New line for action log
          console.log(`\n🔄 Action: ${action.type.toUpperCase()} ${action.amount.toFixed(2)}`);
          console.log(`   Reason: ${action.reason}`);
          console.log(`   Priority: ${action.priority}`);
  
          if (!DRY_RUN) {
            try {
              let success = false;
  
              switch (action.type) {
                case 'split':
                  const splitResult = await ctf.split(CONDITION_ID, action.amount.toString());
                  console.log(`   ✅ Split TX: ${splitResult.txHash}`);
                  success = true;
                  break;
  
                case 'merge':
                  const mergeResult = await ctf.merge(CONDITION_ID, action.amount.toString());
                  console.log(`   ✅ Merge TX: ${mergeResult.txHash}`);
                  success = true;
                  break;
  
                case 'sell_yes':
                  const sellYesResult = await tradingService.createMarketOrder({
                    tokenId: YES_TOKEN_ID,
                    side: 'SELL',
                    amount: action.amount,
                    orderType: 'FOK',
                  });
                  if (sellYesResult.success) {
                    console.log(`   ✅ Sold ${action.amount.toFixed(2)} YES tokens`);
                    success = true;
                  } else {
                    console.log(`   ❌ Sell YES failed: ${sellYesResult.errorMsg || 'unknown error'}`);
                  }
                  break;
  
                case 'sell_no':
                  const sellNoResult = await tradingService.createMarketOrder({
                    tokenId: NO_TOKEN_ID,
                    side: 'SELL',
                    amount: action.amount,
                    orderType: 'FOK',
                  });
                  if (sellNoResult.success) {
                    console.log(`   ✅ Sold ${action.amount.toFixed(2)} NO tokens`);
                    success = true;
                  } else {
                    console.log(`   ❌ Sell NO failed: ${sellNoResult.errorMsg || 'unknown error'}`);
                  }
                  break;
              }
  
              if (success) {
                lastActionTime = now;
              }
            } catch (error: any) {
              console.log(`   ❌ Failed: ${error.message}`);
            }
          } else {
            console.log(`   [DRY RUN] Would execute ${action.type}`);
          }
          console.log();
        }
  
        await sleep(CHECK_INTERVAL);
      } catch (error: any) {
        console.error(`\nError: ${error.message}`);
        await sleep(CHECK_INTERVAL);
      }
    }
  }
  
  async function getBalance(ctf: CTFClient, _tradingService: TradingService): Promise<Balance> {
    // Get USDC.e balance
    const usdcBalance = await ctf.getUsdcBalance();
    const usdc = parseFloat(usdcBalance);
  
    // Get token balances using getPositionBalanceByTokenIds
    const tokenIds = { yesTokenId: YES_TOKEN_ID, noTokenId: NO_TOKEN_ID };
    const positions = await ctf.getPositionBalanceByTokenIds(CONDITION_ID, tokenIds);
  
    const yes = parseFloat(positions.yesBalance);
    const no = parseFloat(positions.noBalance);
  
    // Total = USDC + min(YES, NO) as paired tokens
    const pairedTokens = Math.min(yes, no);
    const total = usdc + pairedTokens;
  
    return { usdc, yes, no, total };
  }
  
  function calculateRebalanceActions(balance: Balance, totalCapital: number): RebalanceAction[] {
    const actions: RebalanceAction[] = [];
  
    const targetUsdc = totalCapital * USDC_RATIO;
    const targetToken = totalCapital * TOKEN_RATIO;
  
    const usdcDiff = balance.usdc - targetUsdc;
    const yesDiff = balance.yes - targetToken;
    const noDiff = balance.no - targetToken;
    const tokenImbalance = balance.yes - balance.no;
  
    // ============================================
    // PRIORITY 1: Fix YES/NO imbalance (HIGHEST)
    // This is critical for risk management!
    // ============================================
    if (Math.abs(tokenImbalance) > IMBALANCE_THRESHOLD) {
      if (tokenImbalance > 0) {
        // YES > NO, sell excess YES
        const sellAmount = Math.floor(Math.min(tokenImbalance, balance.yes * 0.5) * 1e6) / 1e6;
        if (sellAmount >= MIN_SELL_AMOUNT) {
          actions.push({
            type: 'sell_yes',
            amount: sellAmount,
            reason: `⚠️ RISK: YES > NO by ${tokenImbalance.toFixed(2)}. Selling excess YES to balance.`,
            priority: 100, // Highest priority
          });
        }
      } else {
        // NO > YES, sell excess NO
        const sellAmount = Math.floor(Math.min(-tokenImbalance, balance.no * 0.5) * 1e6) / 1e6;
        if (sellAmount >= MIN_SELL_AMOUNT) {
          actions.push({
            type: 'sell_no',
            amount: sellAmount,
            reason: `⚠️ RISK: NO > YES by ${(-tokenImbalance).toFixed(2)}. Selling excess NO to balance.`,
            priority: 100, // Highest priority
          });
        }
      }
    }
  
    // ============================================
    // PRIORITY 2: Merge excess paired tokens
    // ============================================
    const pairedTokens = Math.min(balance.yes, balance.no);
    const excessPairs = pairedTokens - targetToken;
  
    if (excessPairs > MIN_REBALANCE_AMOUNT && usdcDiff < 0) {
      const mergeAmount = Math.floor(Math.min(excessPairs * 0.5, Math.abs(usdcDiff)) * 100) / 100;
      if (mergeAmount >= MIN_REBALANCE_AMOUNT) {
        actions.push({
          type: 'merge',
          amount: mergeAmount,
          reason: `Excess token pairs (${pairedTokens.toFixed(0)} > ${targetToken.toFixed(0)}), USDC low`,
          priority: 50,
        });
      }
    }
  
    // ============================================
    // PRIORITY 3: Split to create more tokens
    // ============================================
    const usdcDeviation = Math.abs(usdcDiff) / targetUsdc;
  
    if (usdcDeviation > REBALANCE_THRESHOLD && usdcDiff > 0) {
      // Check if both tokens are low
      if (yesDiff < 0 && noDiff < 0) {
        const splitAmount = Math.floor(Math.min(
          usdcDiff * 0.5,
          Math.abs(Math.min(yesDiff, noDiff)),
          balance.usdc * 0.3
        ) * 100) / 100;
  
        if (splitAmount >= MIN_REBALANCE_AMOUNT) {
          actions.push({
            type: 'split',
            amount: splitAmount,
            reason: `USDC high (${(usdcDeviation * 100).toFixed(0)}% over), tokens low`,
            priority: 30,
          });
        }
      }
    }
  
    // Default: no action needed
    if (actions.length === 0) {
      actions.push({
        type: 'none',
        amount: 0,
        reason: 'Balanced',
        priority: 0,
      });
    }
  
    return actions;
  }
  
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Run
  main().catch(console.error);
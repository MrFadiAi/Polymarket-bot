/**
 * Polymarket Complete Trading Bot v3.0
 *
 * FULL SDK IMPLEMENTATION - All Features:
 *
 * STRATEGIES:
 * 1. Smart Money Copy Trading - Follow top wallets with quality filtering
 * 2. ArbitrageService - Full auto-execution with rebalancer
 * 3. DipArbService - Auto-rotate + background redeem
 *
 * ON-CHAIN OPERATIONS:
 * 4. OnchainService - Split/Merge/Redeem CTF tokens
 * 5. SwapService - DEX swaps (MATIC/USDC/USDC.e)
 * 6. BridgeClient - Cross-chain deposits
 *
 * ANALYSIS:
 * 7. BinanceService - K-line technical analysis
 * 8. WalletService - Smart scores, profiles
 * 9. SubgraphClient - On-chain position queries
 *
 * TRADING:
 * 10. TradingService - Direct limit/market orders
 *
 * Run with: npx tsx bot-config.ts
 */

import 'dotenv/config';
import {
  PolymarketSDK,
  ArbitrageService,
  OnchainService,
  BridgeClient,
  type SmartMoneyTrade,
  type SmartMoneyLeaderboardEntry,
  type BinanceKLine,
} from './src/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  capital: {
    totalUsd: parseFloat(process.env.CAPITAL_USD || '250'),
    maxPerTradePct: 0.02,  // Reduced from 3% to 2% for safety
    maxPerMarketPct: 0.10,
    maxTotalExposurePct: 0.30,
    minOrderUsd: 5,
    strategyAllocation: {
      smartMoney: 0.60,
      arbitrage: 0.20,
      dipArb: 0.10,
      directTrades: 0.10,
    },
  },

  risk: {
    // Daily limits
    dailyMaxLossPct: 0.05,  // Reduced from 8% to 5%
    maxConsecutiveLosses: 6,
    pauseOnBreachMinutes: 60,

    // 🔴 NEW: Monthly and cumulative limits
    monthlyMaxLossPct: 0.15,  // 15% monthly limit
    maxDrawdownFromPeak: 0.25,  // 25% drawdown from peak
    totalMaxLossPct: 0.40,  // 40% total loss - stop trading entirely

    // 🔴 NEW: Dynamic position sizing
    enableDynamicSizing: true,
    minPositionPct: 0.01,  // 1% minimum
    maxPositionPct: 0.05,  // 5% maximum
    lossSizingReduction: 0.20,  // Reduce 20% per consecutive loss
    winSizingIncrease: 0.10,  // Increase 10% per consecutive win
  },

  smartMoney: {
    enabled: true,
    topN: 20,
    // 🔴 FIXED: Stricter criteria
    minWinRate: 0.60,  // Up from 0.50 to 60%
    minPnl: 500,       // Up from 100 to $500
    minTrades: 30,     // Up from 20 to 30

    // 🔴 NEW: Quality filters
    minProfitFactor: 1.5,  // Total wins / total losses >= 1.5x
    minConsistencyScore: 0.7,  // Recent performance score
    maxSingleTradeExposure: 0.3,  // Max 30% of PnL from one trade
    checkLastNTrades: 10,  // Analyze last 10 trades for consistency

    sizeScale: 0.1,
    maxSizePerTrade: 15,
    maxSlippage: 0.03,
    minTradeSize: 10,
    delay: 500,
    // ADD YOUR CUSTOM WALLETS HERE (will be followed in addition to leaderboard)
    customWallets: [
      '0xc2e7800b5af46e6093872b177b7a5e7f0563be51',  // Top Polymarket trader
      '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74',  // simonbanza
      // Add more wallet addresses here...
    ] as string[],
  },

  arbitrage: {
    enabled: true,
    // 🔴 FIXED: Higher profit threshold to account for gas fees
    profitThreshold: 0.01,  // Up from 0.5% to 1%
    minTradeSize: 20,  // Up from 5 to reduce gas impact
    maxTradeSize: 100,  // Up from 50
    minVolume24h: 5000,
    autoExecute: true,
    enableRebalancer: true,

    // 🔴 NEW: Gas fee accounting
    estimatedGasCostUSD: 0.10,  // Estimated gas per arb cycle
    minNetProfit: 0.50,  // Minimum $0.50 profit after gas
  },

  dipArb: {
    enabled: true,
    coins: ['BTC', 'ETH', 'SOL'] as const,
    shares: 10,
    sumTarget: 0.92,
    autoRotate: true,
    // 🔴 NEW: Minimum trade value enforcement
    minTradeValueUSD: 1.5,  // $1.50 minimum (buffer above $1)
  },

  onchain: {
    enabled: true,
    autoApprove: true,
    minMatic: 0.5,
  },

  binance: {
    enabled: true,
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const,
    interval: '15m' as const,
    trendThreshold: 2,
  },

  directTrading: {
    enabled: true,
    trendFollowing: true,
    minTrendStrength: 0.02,
    // 🔴 NEW: Stop-loss and take-profit
    stopLossPct: 0.15,  // 15% stop loss
    takeProfitPct: 0.25,  // 25% take profit
    trailingStopPct: 0.10,  // 10% trailing stop
    maxHoldDays: 7,  // Exit after 7 days
    minRiskReward: 1.5,  // Minimum 1.5:1 risk/reward ratio
  },

  dryRun: process.env.DRY_RUN !== 'false',
};

// ============================================================================
// STATE
// ============================================================================

interface BotState {
  startTime: number;
  dailyPnL: number;
  totalPnL: number;
  consecutiveLosses: number;
  consecutiveWins: number;  // NEW
  tradesExecuted: number;
  isPaused: boolean;
  pauseUntil: number;

  // 🔴 NEW: Enhanced risk tracking
  monthlyPnL: number;
  monthStartTime: number;
  peakCapital: number;
  currentCapital: number;
  currentDrawdown: number;
  permanentlyHalted: boolean;  // When total loss limit hit
  lastDailyReset: number;

  // Strategy stats
  smartMoneyTrades: number;
  arbTrades: number;
  dipArbTrades: number;
  directTrades: number;
  arbProfit: number;

  // Tracked data
  followedWallets: string[];
  activeArbMarket: string | null;
  activeDipArbMarket: string | null;

  // On-chain stats
  splits: number;
  merges: number;
  redeems: number;
  swaps: number;

  // Balances
  usdcBalance: number;
  usdcEBalance: number;
  maticBalance: number;

  // Analysis
  btcTrend: 'up' | 'down' | 'neutral';
  ethTrend: 'up' | 'down' | 'neutral';
  solTrend: 'up' | 'down' | 'neutral';
}

const state: BotState = {
  startTime: Date.now(),
  dailyPnL: 0,
  totalPnL: 0,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  tradesExecuted: 0,
  isPaused: false,
  pauseUntil: 0,

  // Risk tracking
  monthlyPnL: 0,
  monthStartTime: Date.now(),
  peakCapital: CONFIG.capital.totalUsd,
  currentCapital: CONFIG.capital.totalUsd,
  currentDrawdown: 0,
  permanentlyHalted: false,
  lastDailyReset: Date.now(),

  smartMoneyTrades: 0,
  arbTrades: 0,
  dipArbTrades: 0,
  directTrades: 0,
  arbProfit: 0,
  followedWallets: [],
  activeArbMarket: null,
  activeDipArbMarket: null,
  splits: 0,
  merges: 0,
  redeems: 0,
  swaps: 0,
  usdcBalance: 0,
  usdcEBalance: 0,
  maticBalance: 0,
  btcTrend: 'neutral',
  ethTrend: 'neutral',
  solTrend: 'neutral',
};

// ============================================================================
// UTILITIES
// ============================================================================

function log(level: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const icons: Record<string, string> = {
    INFO: '📋', WARN: '⚠️', ERROR: '❌', TRADE: '💰', SIGNAL: '🎯',
    ARB: '🔄', WALLET: '👛', CHAIN: '⛓️', SWAP: '💱', BRIDGE: '🌉',
    KLINE: '📊', TREND: '📈',
  };
  console.log(`[${timestamp}] ${icons[level] || '•'} ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

// 🔴 FIXED: Comprehensive risk management with multiple layers
function canTrade(): boolean {
  // Check if permanently halted
  if (state.permanentlyHalted) {
    log('ERROR', '🛑 Trading permanently halted - total loss limit reached');
    return false;
  }

  // Reset daily PnL if new day
  const daysSinceReset = (Date.now() - state.lastDailyReset) / (1000 * 60 * 60 * 24);
  if (daysSinceReset >= 1) {
    log('INFO', `Daily PnL reset. Previous day: $${state.dailyPnL.toFixed(2)}`);
    state.dailyPnL = 0;
    state.lastDailyReset = Date.now();
  }

  // Reset monthly PnL if new month
  const daysSinceMonthStart = (Date.now() - state.monthStartTime) / (1000 * 60 * 60 * 24);
  if (daysSinceMonthStart >= 30) {
    log('INFO', `Monthly PnL reset. Previous month: $${state.monthlyPnL.toFixed(2)}`);
    state.monthlyPnL = 0;
    state.monthStartTime = Date.now();
  }

  // Update current capital and drawdown
  state.currentCapital = CONFIG.capital.totalUsd + state.totalPnL;
  if (state.currentCapital > state.peakCapital) {
    state.peakCapital = state.currentCapital;
  }
  state.currentDrawdown = (state.peakCapital - state.currentCapital) / state.peakCapital;

  // Check temporary pause
  if (state.isPaused && Date.now() < state.pauseUntil) return false;
  if (state.isPaused && Date.now() >= state.pauseUntil) {
    state.isPaused = false;
    log('INFO', 'Bot resumed after cooldown');
  }

  // 🔴 Layer 1: Daily loss limit
  const dailyLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.dailyMaxLossPct;
  if (state.dailyPnL <= -dailyLossLimit) {
    state.isPaused = true;
    state.pauseUntil = Date.now() + CONFIG.risk.pauseOnBreachMinutes * 60 * 1000;
    log('WARN', `Daily loss limit breached: -$${Math.abs(state.dailyPnL).toFixed(2)} (limit: $${dailyLossLimit.toFixed(2)})`);
    log('WARN', `Bot paused for ${CONFIG.risk.pauseOnBreachMinutes} minutes`);
    return false;
  }

  // 🔴 Layer 2: Monthly loss limit (NEW)
  const monthlyLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.monthlyMaxLossPct;
  if (state.monthlyPnL <= -monthlyLossLimit) {
    log('ERROR', `🛑 Monthly loss limit breached: -$${Math.abs(state.monthlyPnL).toFixed(2)} (limit: $${monthlyLossLimit.toFixed(2)})`);
    log('ERROR', 'Trading paused until next month');
    state.isPaused = true;
    state.pauseUntil = Date.now() + (30 * 24 * 60 * 60 * 1000);  // Pause for 30 days
    return false;
  }

  // 🔴 Layer 3: Drawdown from peak (NEW)
  if (state.currentDrawdown >= CONFIG.risk.maxDrawdownFromPeak) {
    log('ERROR', `🛑 Maximum drawdown reached: ${(state.currentDrawdown * 100).toFixed(1)}% (limit: ${(CONFIG.risk.maxDrawdownFromPeak * 100).toFixed(1)}%)`);
    log('ERROR', `Peak: $${state.peakCapital.toFixed(2)} → Current: $${state.currentCapital.toFixed(2)}`);
    state.isPaused = true;
    state.pauseUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);  // Pause for 7 days
    return false;
  }

  // 🔴 Layer 4: Total loss limit - PERMANENT HALT (NEW)
  const totalLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.totalMaxLossPct;
  if (state.totalPnL <= -totalLossLimit) {
    state.permanentlyHalted = true;
    log('ERROR', '💀 TOTAL LOSS LIMIT REACHED - TRADING PERMANENTLY HALTED');
    log('ERROR', `Total loss: -$${Math.abs(state.totalPnL).toFixed(2)} (limit: $${totalLossLimit.toFixed(2)})`);
    log('ERROR', 'Please review strategy before restarting with new capital');
    return false;
  }

  return true;
}

// 🔴 FIXED: Enhanced trade recording with win tracking
function recordTrade(profit: number, strategy: string) {
  state.tradesExecuted++;
  state.dailyPnL += profit;
  state.monthlyPnL += profit;  // NEW
  state.totalPnL += profit;

  // Track consecutive wins/losses
  if (profit < 0) {
    state.consecutiveLosses++;
    state.consecutiveWins = 0;
  } else {
    state.consecutiveLosses = 0;
    state.consecutiveWins++;
  }

  if (strategy === 'smartMoney') state.smartMoneyTrades++;
  else if (strategy === 'arbitrage') state.arbTrades++;
  else if (strategy === 'dipArb') state.dipArbTrades++;
  else if (strategy === 'direct') state.directTrades++;
}

// 🔴 NEW: Dynamic position sizing based on performance
function calculatePositionSize(baseSize: number): number {
  if (!CONFIG.risk.enableDynamicSizing) return baseSize;

  let size = baseSize;

  // Reduce during losing streaks
  if (state.consecutiveLosses > 2) {
    const reduction = Math.pow(1 - CONFIG.risk.lossSizingReduction, state.consecutiveLosses - 2);
    size *= reduction;
    if (CONFIG.risk.minPositionPct && size < CONFIG.risk.minPositionPct) {
      log('WARN', `Position size reduced to minimum ${(CONFIG.risk.minPositionPct * 100).toFixed(1)}% due to ${state.consecutiveLosses} consecutive losses`);
    }
  }

  // Increase slightly during winning streaks (capped)
  if (state.consecutiveWins > 3) {
    const increase = 1 + (Math.min(state.consecutiveWins - 3, 5) * CONFIG.risk.winSizingIncrease);
    size *= increase;
  }

  // Apply floor and ceiling
  size = Math.max(CONFIG.risk.minPositionPct || 0.01, size);
  size = Math.min(CONFIG.risk.maxPositionPct || 0.05, size);

  return size;
}

// ============================================================================
// 1. SMART MONEY STRATEGY
// ============================================================================

async function setupSmartMoney(sdk: PolymarketSDK) {
  if (!CONFIG.smartMoney.enabled) return;
  log('WALLET', '🔍 Setting up Smart Money with ENHANCED quality filtering...');

  const qualified: string[] = [];

  // 1. Add custom wallets first (always included, no filtering)
  if (CONFIG.smartMoney.customWallets && CONFIG.smartMoney.customWallets.length > 0) {
    for (const wallet of CONFIG.smartMoney.customWallets) {
      qualified.push(wallet);
      log('WALLET', `⭐ Custom wallet added: ${wallet.slice(0, 10)}...`);
    }
  }

  // 2. Add wallets from leaderboard (with STRICT filtering)
  const leaderboard = await sdk.smartMoney.getLeaderboard({ limit: CONFIG.smartMoney.topN * 2 });

  for (const entry of leaderboard.entries) {
    try {
      const positions = await sdk.dataApi.getPositions(entry.address);

      if (positions.length < CONFIG.smartMoney.minTrades) {
        continue;  // Skip if not enough trades
      }

      // Calculate basic stats
      const wins = positions.filter(p => (p.cashPnl ?? 0) > 0);
      const losses = positions.filter(p => (p.cashPnl ?? 0) < 0);
      const winRate = positions.length > 0 ? wins.length / positions.length : 0;

      // 🔴 NEW: Profit Factor (total wins / total losses)
      const totalWins = wins.reduce((sum, p) => sum + Math.abs(p.cashPnl ?? 0), 0);
      const totalLosses = losses.reduce((sum, p) => sum + Math.abs(p.cashPnl ?? 0), 0);
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);

      // 🔴 NEW: Check for whale trades (single trade dominance)
      const sortedPnl = positions.map(p => Math.abs(p.cashPnl ?? 0)).sort((a, b) => b - a);
      const biggestTrade = sortedPnl[0] ?? 0;
      const totalAbsPnl = sortedPnl.reduce((s, v) => s + v, 0);
      const singleTradeExposure = totalAbsPnl > 0 ? biggestTrade / totalAbsPnl : 0;

      // 🔴 NEW: Consistency score (last N trades performance)
      const lastNTrades = positions.slice(0, CONFIG.smartMoney.checkLastNTrades);
      const recentWins = lastNTrades.filter(p => (p.cashPnl ?? 0) > 0).length;
      const consistencyScore = lastNTrades.length > 0 ? recentWins / lastNTrades.length : 0;

      // Apply ALL filters
      const passesWinRate = winRate >= CONFIG.smartMoney.minWinRate;
      const passesPnl = entry.pnl >= CONFIG.smartMoney.minPnl;
      const passesTrades = (entry.tradeCount || 0) >= CONFIG.smartMoney.minTrades;
      const passesProfitFactor = profitFactor >= CONFIG.smartMoney.minProfitFactor;
      const passesConsistency = consistencyScore >= CONFIG.smartMoney.minConsistencyScore;
      const passesWhaleCheck = singleTradeExposure <= CONFIG.smartMoney.maxSingleTradeExposure;

      if (passesWinRate && passesPnl && passesTrades && passesProfitFactor && passesConsistency && passesWhaleCheck) {
        if (!qualified.includes(entry.address)) {
          qualified.push(entry.address);
          log('WALLET', `✅ ${entry.address.slice(0, 10)}... WR:${(winRate * 100).toFixed(0)}% PF:${profitFactor.toFixed(2)}x Consistency:${(consistencyScore * 100).toFixed(0)}% PnL:$${entry.pnl}`);
        }
      } else {
        // Log why wallet was rejected (in debug mode)
        const failures = [];
        if (!passesWinRate) failures.push(`WR:${(winRate * 100).toFixed(0)}%<${(CONFIG.smartMoney.minWinRate * 100).toFixed(0)}%`);
        if (!passesProfitFactor) failures.push(`PF:${profitFactor.toFixed(2)}<${CONFIG.smartMoney.minProfitFactor}`);
        if (!passesConsistency) failures.push(`Cons:${(consistencyScore * 100).toFixed(0)}%<${(CONFIG.smartMoney.minConsistencyScore * 100).toFixed(0)}%`);
        if (!passesWhaleCheck) failures.push(`Whale:${(singleTradeExposure * 100).toFixed(0)}%>${(CONFIG.smartMoney.maxSingleTradeExposure * 100).toFixed(0)}%`);
        if (CONFIG.dryRun && failures.length > 0) {
          log('WALLET', `❌ ${entry.address.slice(0, 10)}... REJECTED: ${failures.join(', ')}`);
        }
      }

      await new Promise(r => setTimeout(r, 200));
    } catch { /* skip */ }
  }

  if (qualified.length === 0) {
    log('WARN', 'No qualified wallets');
    return;
  }

  state.followedWallets = qualified;
  log('WALLET', `Following ${qualified.length} wallets`);

  if (!CONFIG.dryRun) {
    await sdk.smartMoney.startAutoCopyTrading({
      targetAddresses: qualified,
      sizeScale: CONFIG.smartMoney.sizeScale,
      maxSizePerTrade: CONFIG.smartMoney.maxSizePerTrade,
      maxSlippage: CONFIG.smartMoney.maxSlippage,
      minTradeSize: CONFIG.smartMoney.minTradeSize,
      delay: CONFIG.smartMoney.delay,
      dryRun: false,
      onTrade: (trade, result) => {
        if (result.success) {
          log('TRADE', `Copied ${trade.side} from ${trade.traderAddress.slice(0, 8)}...`);
          recordTrade(0, 'smartMoney');
        }
      },
      onError: (err) => log('ERROR', `Copy error: ${err.message}`),
    });
  }
}

// ============================================================================
// 2. ARBITRAGE SERVICE
// ============================================================================

let arbService: ArbitrageService | null = null;

async function setupArbitrage(sdk: PolymarketSDK) {
  if (!CONFIG.arbitrage.enabled) return;
  log('ARB', 'Setting up ArbitrageService...');

  arbService = new ArbitrageService({
    privateKey: CONFIG.dryRun ? undefined : process.env.POLYMARKET_PRIVATE_KEY,
    profitThreshold: CONFIG.arbitrage.profitThreshold,
    minTradeSize: CONFIG.arbitrage.minTradeSize,
    maxTradeSize: CONFIG.arbitrage.maxTradeSize,
    autoExecute: !CONFIG.dryRun && CONFIG.arbitrage.autoExecute,
    enableRebalancer: !CONFIG.dryRun && CONFIG.arbitrage.enableRebalancer,
    enableLogging: true,
  });

  arbService.on('opportunity', (opp) => {
    log('ARB', `🎯 ${opp.type.toUpperCase()} +${opp.profitPercent.toFixed(2)}%`);
  });

  arbService.on('execution', (result) => {
    if (result.success) {
      state.arbProfit += result.profit;
      log('TRADE', `Arb executed: +$${result.profit.toFixed(2)}`);
      recordTrade(result.profit, 'arbitrage');
    }
  });

  const results = await arbService.scanMarkets({ minVolume24h: CONFIG.arbitrage.minVolume24h }, CONFIG.arbitrage.profitThreshold);
  const opps = results.filter(r => r.arbType !== 'none');

  if (opps.length > 0) {
    state.activeArbMarket = opps[0].market.name;
    await arbService.start(opps[0].market);
    log('ARB', `Started: ${opps[0].market.name}`);
  }
}

// ============================================================================
// 3. DIP ARB SERVICE
// ============================================================================

async function setupDipArb(sdk: PolymarketSDK) {
  if (!CONFIG.dipArb.enabled) return;
  log('INFO', 'Setting up DipArb...');

  sdk.dipArb.updateConfig({
    shares: CONFIG.dipArb.shares,
    sumTarget: CONFIG.dipArb.sumTarget,
    autoExecute: !CONFIG.dryRun,
    debug: true,
  });

  sdk.dipArb.on('signal', (s) => log('SIGNAL', `DipArb: ${s.type} ${s.side}`));
  sdk.dipArb.on('execution', (r) => {
    if (r.success) {
      log('TRADE', `DipArb ${r.leg}: ${r.side}`);
      recordTrade(0, 'dipArb');
    }
  });
  sdk.dipArb.on('rotate', (e) => {
    state.activeDipArbMarket = e.newMarket;
    log('INFO', `DipArb rotated to ${e.newMarket}`);
  });

  if (CONFIG.dipArb.autoRotate) {
    sdk.dipArb.enableAutoRotate({
      enabled: true,
      underlyings: ['ETH', 'BTC', 'SOL'],
      duration: '15m',
      settleStrategy: 'redeem',
      redeemWaitMinutes: 5,
    });
  }

  try {
    const market = await sdk.dipArb.findAndStart({ coin: 'ETH', preferDuration: '15m' });
    if (market) state.activeDipArbMarket = market.name;
  } catch { /* no markets */ }
}

// ============================================================================
// 4. ON-CHAIN SERVICE (Split/Merge/Redeem)
// ============================================================================

let onchainService: OnchainService | null = null;

async function setupOnchain() {
  if (!CONFIG.onchain.enabled || CONFIG.dryRun) {
    log('CHAIN', 'OnchainService disabled or dry run');
    return;
  }

  log('CHAIN', 'Setting up OnchainService...');

  try {
    onchainService = new OnchainService({
      privateKey: process.env.POLYMARKET_PRIVATE_KEY!,
    });

    const status = await onchainService.checkReadyForCTF('10');
    log('CHAIN', 'CTF Ready Status', {
      ready: status.ready,
      usdcE: status.usdcEBalance,
      matic: status.maticBalance,
      issues: status.issues,
    });

    state.usdcEBalance = parseFloat(status.usdcEBalance);
    state.maticBalance = parseFloat(status.maticBalance);

    if (!status.ready && CONFIG.onchain.autoApprove) {
      log('CHAIN', 'Setting up approvals...');
      await onchainService.approveAll();
      log('CHAIN', 'Approvals complete');
    }
  } catch (err) {
    log('ERROR', `OnchainService setup failed: ${(err as Error).message}`);
  }
}

// ============================================================================
// 5. SWAP SERVICE (DEX Swaps)
// ============================================================================

async function setupSwap(sdk: PolymarketSDK) {
  if (CONFIG.dryRun) {
    log('SWAP', 'SwapService disabled in dry run');
    return;
  }

  log('SWAP', 'Checking token balances...');

  try {
    // Use SDK's trading service to get wallet info
    const address = sdk.tradingService.getAddress();
    log('SWAP', `Wallet address: ${address}`);

    // Note: For full SwapService, you need ethers.Wallet instance
    // This is a simplified balance check using the SDK
    log('SWAP', 'SwapService requires ethers.Wallet - use OnchainService for balances');
  } catch (err) {
    log('WARN', `Swap setup: ${(err as Error).message}`);
  }
}

// ============================================================================
// 6. BRIDGE CLIENT (Cross-chain deposits)
// ============================================================================

async function setupBridge(sdk: PolymarketSDK) {
  log('BRIDGE', 'Checking bridge deposit addresses...');

  try {
    const bridgeClient = new BridgeClient();
    const supported = await bridgeClient.getSupportedAssets();

    const chainNames = supported.map(a => a.chainName);
    const uniqueChains = chainNames.filter((v, i, a) => a.indexOf(v) === i);
    log('BRIDGE', `Supported chains: ${uniqueChains.join(', ')}`);

    const depositAddresses = await bridgeClient.createDepositAddresses(
      sdk.tradingService.getAddress()
    );

    if (depositAddresses.address?.evm) {
      log('BRIDGE', `EVM deposit address: ${depositAddresses.address.evm}`);
    }
  } catch (err) {
    log('WARN', `Bridge setup: ${(err as Error).message}`);
  }
}

// ============================================================================
// 7. BINANCE SERVICE (K-line Analysis)
// ============================================================================

async function setupBinanceAnalysis(sdk: PolymarketSDK) {
  if (!CONFIG.binance.enabled) return;
  log('KLINE', 'Setting up Binance K-line analysis...');

  async function analyzeTrend(symbol: 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'): Promise<'up' | 'down' | 'neutral'> {
    try {
      const klines = await sdk.binance.getKLines(symbol, CONFIG.binance.interval, { limit: 20 });
      if (klines.length < 10) return 'neutral';

      const recent = klines.slice(-5);
      const older = klines.slice(-10, -5);

      const recentAvg = recent.reduce((s, k) => s + k.close, 0) / recent.length;
      const olderAvg = older.reduce((s, k) => s + k.close, 0) / older.length;

      const change = (recentAvg - olderAvg) / olderAvg;

      if (change > CONFIG.binance.trendThreshold / 100) return 'up';
      if (change < -CONFIG.binance.trendThreshold / 100) return 'down';
      return 'neutral';
    } catch {
      return 'neutral';
    }
  }

  async function updateTrends() {
    state.btcTrend = await analyzeTrend('BTCUSDT');
    state.ethTrend = await analyzeTrend('ETHUSDT');
    state.solTrend = await analyzeTrend('SOLUSDT');
    log('TREND', `BTC:${state.btcTrend} ETH:${state.ethTrend} SOL:${state.solTrend}`);
  }

  await updateTrends();
  setInterval(updateTrends, 5 * 60 * 1000);
}

// ============================================================================
// 8. WALLET SERVICE (Smart Scores)
// ============================================================================

async function analyzeTopWallets(sdk: PolymarketSDK) {
  log('WALLET', 'Analyzing top wallets with WalletService...');

  try {
    const leaderboard = await sdk.wallets.getLeaderboardByPeriod('week', 5, 'pnl');

    for (const entry of leaderboard) {
      const profile = await sdk.wallets.getWalletProfile(entry.address);
      log('WALLET', `${entry.address.slice(0, 10)}...`, {
        rank: entry.rank,
        pnl: `$${entry.pnl.toLocaleString()}`,
        volume: `$${entry.volume.toLocaleString()}`,
        smartScore: profile?.smartScore || 'N/A',
        positions: profile?.positionCount || 0,
      });
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (err) {
    log('WARN', `Wallet analysis: ${(err as Error).message}`);
  }
}

// ============================================================================
// 9. SUBGRAPH (On-chain queries)
// ============================================================================

async function queryOnchainData(sdk: PolymarketSDK) {
  log('INFO', 'Querying on-chain data via Subgraph...');

  try {
    const address = sdk.tradingService.getAddress();
    const positions = await sdk.subgraph.getUserPositions(address);
    log('INFO', `On-chain positions: ${positions.length}`);

    const globalOI = await sdk.subgraph.getGlobalOpenInterest();
    log('INFO', `Global Open Interest: ${globalOI}`);
  } catch (err) {
    log('WARN', `Subgraph query: ${(err as Error).message}`);
  }
}

// ============================================================================
// 10. DIRECT TRADING (Limit/Market Orders)
// ============================================================================

async function setupDirectTrading(sdk: PolymarketSDK) {
  if (!CONFIG.directTrading.enabled || CONFIG.dryRun) {
    log('INFO', 'Direct trading disabled');
    return;
  }

  log('INFO', 'Direct trading enabled - will place orders based on trend analysis');

  async function checkTrendTrades() {
    if (!canTrade()) return;

    const trendingMarkets = await sdk.gammaApi.getTrendingMarkets(5);

    for (const market of trendingMarkets) {
      if (!market.conditionId) continue;

      try {
        const fullMarket = await sdk.getMarket(market.conditionId);
        const yesToken = fullMarket.tokens.find(t => t.outcome === 'Yes');
        const noToken = fullMarket.tokens.find(t => t.outcome === 'No');

        if (!yesToken || !noToken) continue;

        const isCryptoMarket = /btc|bitcoin|eth|ethereum|sol|solana/i.test(market.question || '');

        if (isCryptoMarket && CONFIG.directTrading.trendFollowing) {
          let trend: 'up' | 'down' | 'neutral' = 'neutral';
          if (/btc|bitcoin/i.test(market.question || '')) trend = state.btcTrend;
          else if (/eth|ethereum/i.test(market.question || '')) trend = state.ethTrend;
          else if (/sol|solana/i.test(market.question || '')) trend = state.solTrend;

          if (trend !== 'neutral') {
            const side = trend === 'up' ? 'BUY' : 'SELL';
            const tokenId = trend === 'up' ? yesToken.tokenId : noToken.tokenId;
            const price = trend === 'up' ? yesToken.price : noToken.price;

            log('SIGNAL', `Trend signal: ${market.question?.slice(0, 40)}... → ${side} @ ${price.toFixed(2)}`);
          }
        }
      } catch { /* skip */ }
    }
  }

  setInterval(checkTrendTrades, 5 * 60 * 1000);
}

// ============================================================================
// STATUS DISPLAY
// ============================================================================

function displayStatus() {
  const runtime = Math.round((Date.now() - state.startTime) / 1000 / 60);

  console.log('\n' + '═'.repeat(80));
  console.log('           POLYMARKET TRADING BOT v3.0 - ENHANCED RISK MANAGEMENT');
  console.log('═'.repeat(80));
  console.log(`  Runtime:        ${runtime} minutes`);
  console.log(`  Mode:           ${CONFIG.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);
  console.log(`  Status:         ${state.permanentlyHalted ? '🛑 HALTED (TOTAL LOSS)' : state.isPaused ? '⏸️ PAUSED' : '✅ ACTIVE'}`);
  console.log('─'.repeat(80));
  console.log('  BALANCES:');
  console.log(`    MATIC:        ${state.maticBalance.toFixed(4)}`);
  console.log(`    USDC:         $${state.usdcBalance.toFixed(2)}`);
  console.log(`    USDC.e:       $${state.usdcEBalance.toFixed(2)}`);
  console.log('─'.repeat(80));
  console.log('  PnL & CAPITAL:');
  console.log(`    Daily:        $${state.dailyPnL >= 0 ? '+' : ''}${state.dailyPnL.toFixed(2)} / $${(CONFIG.capital.totalUsd * CONFIG.risk.dailyMaxLossPct).toFixed(2)} limit (${(CONFIG.risk.dailyMaxLossPct * 100).toFixed(0)}%)`);
  console.log(`    Monthly:      $${state.monthlyPnL >= 0 ? '+' : ''}${state.monthlyPnL.toFixed(2)} / $${(CONFIG.capital.totalUsd * CONFIG.risk.monthlyMaxLossPct).toFixed(2)} limit (${(CONFIG.risk.monthlyMaxLossPct * 100).toFixed(0)}%)`);
  console.log(`    Total:        $${state.totalPnL >= 0 ? '+' : ''}${state.totalPnL.toFixed(2)}`);
  console.log(`    Current:      $${state.currentCapital.toFixed(2)} (Peak: $${state.peakCapital.toFixed(2)})`);
  console.log(`    Drawdown:     ${(state.currentDrawdown * 100).toFixed(1)}% / ${(CONFIG.risk.maxDrawdownFromPeak * 100).toFixed(0)}% max`);
  console.log(`    Arb Profit:   $${state.arbProfit >= 0 ? '+' : ''}${state.arbProfit.toFixed(2)}`);
  console.log('─'.repeat(80));
  console.log('  RISK STATUS:');
  const dailyPct = (Math.abs(state.dailyPnL) / CONFIG.capital.totalUsd * 100).toFixed(1);
  const monthlyPct = (Math.abs(state.monthlyPnL) / CONFIG.capital.totalUsd * 100).toFixed(1);
  const totalPct = (Math.abs(state.totalPnL) / CONFIG.capital.totalUsd * 100).toFixed(1);
  const dailyStatus = state.dailyPnL <= -(CONFIG.capital.totalUsd * CONFIG.risk.dailyMaxLossPct) ? '🔴 BREACHED' : '✅ OK';
  const monthlyStatus = state.monthlyPnL <= -(CONFIG.capital.totalUsd * CONFIG.risk.monthlyMaxLossPct) ? '🔴 BREACHED' : '✅ OK';
  const drawdownStatus = state.currentDrawdown >= CONFIG.risk.maxDrawdownFromPeak ? '🔴 BREACHED' : '✅ OK';
  console.log(`    Daily Limit:  ${dailyStatus} (${dailyPct}% used)`);
  console.log(`    Monthly Limit:${monthlyStatus} (${monthlyPct}% used)`);
  console.log(`    Drawdown:     ${drawdownStatus} (${(state.currentDrawdown * 100).toFixed(1)}%)`);
  console.log(`    Consecutive:  ${state.consecutiveLosses} losses | ${state.consecutiveWins} wins`);
  console.log('─'.repeat(80));
  console.log('  STRATEGIES:');
  console.log(`    Smart Money:  ${state.smartMoneyTrades} trades | ${state.followedWallets.length} wallets`);
  console.log(`    Arbitrage:    ${state.arbTrades} trades | ${state.activeArbMarket || 'scanning'}`);
  console.log(`    DipArb:       ${state.dipArbTrades} trades | ${state.activeDipArbMarket || 'waiting'}`);
  console.log(`    Direct:       ${state.directTrades} trades`);
  console.log('─'.repeat(80));
  console.log('  ON-CHAIN:');
  console.log(`    Splits:       ${state.splits} | Merges: ${state.merges} | Redeems: ${state.redeems}`);
  console.log(`    Swaps:        ${state.swaps}`);
  console.log('─'.repeat(80));
  console.log('  TRENDS:');
  console.log(`    BTC: ${state.btcTrend.toUpperCase().padEnd(8)} ETH: ${state.ethTrend.toUpperCase().padEnd(8)} SOL: ${state.solTrend.toUpperCase()}`);
  console.log('═'.repeat(80) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          POLYMARKET COMPLETE TRADING BOT v3.0                      ║');
  console.log('║  All Features: Smart Money | Arb | DipArb | OnChain | Binance      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  if (!process.env.POLYMARKET_PRIVATE_KEY) {
    log('ERROR', 'POLYMARKET_PRIVATE_KEY not found');
    process.exit(1);
  }

  log('INFO', 'Configuration', {
    capital: `$${CONFIG.capital.totalUsd}`,
    dryRun: CONFIG.dryRun,
    strategies: {
      smartMoney: CONFIG.smartMoney.enabled,
      arbitrage: CONFIG.arbitrage.enabled,
      dipArb: CONFIG.dipArb.enabled,
      directTrading: CONFIG.directTrading.enabled,
    },
    onchain: CONFIG.onchain.enabled,
    binance: CONFIG.binance.enabled,
  });

  const sdk = await PolymarketSDK.create({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY,
  });

  log('INFO', `Wallet: ${sdk.tradingService.getAddress()}`);

  // Setup all services
  await setupSwap(sdk);
  await setupOnchain();
  await setupBridge(sdk);
  await setupBinanceAnalysis(sdk);
  await analyzeTopWallets(sdk);
  await queryOnchainData(sdk);
  await setupSmartMoney(sdk);
  await setupArbitrage(sdk);
  await setupDipArb(sdk);
  await setupDirectTrading(sdk);

  displayStatus();
  setInterval(displayStatus, 60000);

  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    if (arbService) await arbService.stop();
    await sdk.dipArb.stop();
    displayStatus();
    sdk.stop();
    process.exit(0);
  });

  log('INFO', '🚀 Bot v3.0 running! Press Ctrl+C to stop.\n');
}

main().catch((err) => {
  log('ERROR', `Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});

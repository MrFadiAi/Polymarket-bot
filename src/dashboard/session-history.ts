/**
 * Session History Service
 * Saves and loads trading session history to/from a JSON file
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types
export interface TradeRecord {
  id: string;
  timestamp: string;
  strategy: 'smartMoney' | 'arbitrage' | 'dipArb' | 'direct';
  market: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  profit: number;
  wallet?: string;
  txHash?: string;
}

export interface SessionSummary {
  id: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  totalPnL: number;
  startingBalance: number;
  endingBalance: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgProfitPerTrade: number;
  largestWin: number;
  largestLoss: number;
  strategyStats: {
    smartMoney: { trades: number; profit: number };
    arbitrage: { trades: number; profit: number };
    dipArb: { trades: number; profit: number };
    direct: { trades: number; profit: number };
  };
  walletPerformance: {
    wallet: string;
    trades: number;
    profit: number;
    winRate: number;
  }[];
  onChainOps: {
    splits: number;
    merges: number;
    redeems: number;
    swaps: number;
  };
  trades: TradeRecord[];
  dryRun: boolean;
  strategies: {
    smartMoney: boolean;
    arbitrage: boolean;
    dipArb: boolean;
    direct: boolean;
  };
}

export interface HistoryData {
  sessions: SessionSummary[];
  totalSessions: number;
  totalProfit: number;
  totalTrades: number;
  overallWinRate: number;
}

// History file path
const DATA_DIR = join(__dirname, '../../data');
const HISTORY_FILE = join(DATA_DIR, 'session-history.json');

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load history from file
 */
export function loadHistory(): HistoryData {
  ensureDataDir();
  
  if (!existsSync(HISTORY_FILE)) {
    return {
      sessions: [],
      totalSessions: 0,
      totalProfit: 0,
      totalTrades: 0,
      overallWinRate: 0,
    };
  }

  try {
    const data = readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data) as HistoryData;
  } catch (error) {
    console.error('[SessionHistory] Error loading history:', error);
    return {
      sessions: [],
      totalSessions: 0,
      totalProfit: 0,
      totalTrades: 0,
      overallWinRate: 0,
    };
  }
}

/**
 * Save history to file
 */
export function saveHistory(history: HistoryData): void {
  ensureDataDir();
  
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log('[SessionHistory] History saved successfully');
  } catch (error) {
    console.error('[SessionHistory] Error saving history:', error);
  }
}

/**
 * Add a new session to history
 */
export function addSession(session: SessionSummary): void {
  const history = loadHistory();
  
  // Add session at the beginning (newest first)
  history.sessions.unshift(session);
  
  // Recalculate totals
  history.totalSessions = history.sessions.length;
  history.totalProfit = history.sessions.reduce((sum, s) => sum + s.totalPnL, 0);
  history.totalTrades = history.sessions.reduce((sum, s) => sum + s.totalTrades, 0);
  
  const totalWins = history.sessions.reduce((sum, s) => sum + s.wins, 0);
  history.overallWinRate = history.totalTrades > 0 ? (totalWins / history.totalTrades) * 100 : 0;
  
  // Keep only last 100 sessions to prevent file from growing too large
  if (history.sessions.length > 100) {
    history.sessions = history.sessions.slice(0, 100);
  }
  
  saveHistory(history);
}

/**
 * Create a session summary from current bot state
 */
export function createSessionFromState(
  startTime: number,
  state: {
    totalPnL: number;
    tradesExecuted: number;
    smartMoneyTrades: number;
    arbTrades: number;
    dipArbTrades: number;
    directTrades: number;
    arbProfit: number;
    followedWallets: string[];
    splits: number;
    merges: number;
    redeems: number;
    swaps: number;
    usdcBalance: number;
    usdcEBalance: number;
  },
  config: {
    dryRun: boolean;
    smartMoney: { enabled: boolean };
    arbitrage: { enabled: boolean };
    dipArb: { enabled: boolean };
    directTrading: { enabled: boolean };
  },
  trades: TradeRecord[] = []
): SessionSummary {
  const endTime = Date.now();
  const durationMs = endTime - startTime;
  
  // Calculate wins/losses from trades
  const wins = trades.filter(t => t.profit > 0).length;
  const losses = trades.filter(t => t.profit < 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const avgProfitPerTrade = trades.length > 0 ? state.totalPnL / trades.length : 0;
  const largestWin = trades.length > 0 ? Math.max(...trades.map(t => t.profit), 0) : 0;
  const largestLoss = trades.length > 0 ? Math.min(...trades.map(t => t.profit), 0) : 0;
  
  // Calculate wallet performance
  const walletMap = new Map<string, { trades: number; profit: number; wins: number }>();
  trades.filter(t => t.wallet).forEach(t => {
    const existing = walletMap.get(t.wallet!) || { trades: 0, profit: 0, wins: 0 };
    existing.trades++;
    existing.profit += t.profit;
    if (t.profit > 0) existing.wins++;
    walletMap.set(t.wallet!, existing);
  });
  
  const walletPerformance = Array.from(walletMap.entries()).map(([wallet, data]) => ({
    wallet,
    trades: data.trades,
    profit: data.profit,
    winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
  })).sort((a, b) => b.profit - a.profit);
  
  // Calculate strategy profits (estimated from trade counts if no detailed data)
  const strategyStats = {
    smartMoney: { 
      trades: state.smartMoneyTrades, 
      profit: trades.filter(t => t.strategy === 'smartMoney').reduce((s, t) => s + t.profit, 0) 
    },
    arbitrage: { 
      trades: state.arbTrades, 
      profit: state.arbProfit 
    },
    dipArb: { 
      trades: state.dipArbTrades, 
      profit: trades.filter(t => t.strategy === 'dipArb').reduce((s, t) => s + t.profit, 0) 
    },
    direct: { 
      trades: state.directTrades, 
      profit: trades.filter(t => t.strategy === 'direct').reduce((s, t) => s + t.profit, 0) 
    },
  };
  
  const startingBalance = state.usdcBalance + state.usdcEBalance - state.totalPnL;
  
  return {
    id: `session-${startTime}`,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(endTime).toISOString(),
    durationMs,
    totalPnL: state.totalPnL,
    startingBalance: Math.max(0, startingBalance),
    endingBalance: state.usdcBalance + state.usdcEBalance,
    totalTrades: state.tradesExecuted,
    wins,
    losses,
    winRate,
    avgProfitPerTrade,
    largestWin,
    largestLoss,
    strategyStats,
    walletPerformance,
    onChainOps: {
      splits: state.splits,
      merges: state.merges,
      redeems: state.redeems,
      swaps: state.swaps,
    },
    trades,
    dryRun: config.dryRun,
    strategies: {
      smartMoney: config.smartMoney.enabled,
      arbitrage: config.arbitrage.enabled,
      dipArb: config.dipArb.enabled,
      direct: config.directTrading.enabled,
    },
  };
}

/**
 * Get history summary (without full trade details for lighter response)
 */
export function getHistorySummary(): HistoryData {
  const history = loadHistory();
  
  // Return sessions without full trade arrays for lighter response
  return {
    ...history,
    sessions: history.sessions.map(s => ({
      ...s,
      trades: [], // Don't include full trades in summary
    })),
  };
}

/**
 * Get a specific session with full details
 */
export function getSession(sessionId: string): SessionSummary | null {
  const history = loadHistory();
  return history.sessions.find(s => s.id === sessionId) || null;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const history = loadHistory();
  const index = history.sessions.findIndex(s => s.id === sessionId);
  
  if (index === -1) return false;
  
  history.sessions.splice(index, 1);
  
  // Recalculate totals
  history.totalSessions = history.sessions.length;
  history.totalProfit = history.sessions.reduce((sum, s) => sum + s.totalPnL, 0);
  history.totalTrades = history.sessions.reduce((sum, s) => sum + s.totalTrades, 0);
  
  const totalWins = history.sessions.reduce((sum, s) => sum + s.wins, 0);
  history.overallWinRate = history.totalTrades > 0 ? (totalWins / history.totalTrades) * 100 : 0;
  
  saveHistory(history);
  return true;
}

/**
 * Clear all history
 */
export function clearHistory(): void {
  saveHistory({
    sessions: [],
    totalSessions: 0,
    totalProfit: 0,
    totalTrades: 0,
    overallWinRate: 0,
  });
}

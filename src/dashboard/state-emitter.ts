/**
 * State Emitter - Broadcasts bot state and logs to connected clients
 * 
 * Usage in your bot:
 *   import { dashboardEmitter } from './src/dashboard/state-emitter.js';
 *   
 *   // Update state
 *   dashboardEmitter.updateState(state);
 *   
 *   // Add log
 *   dashboardEmitter.log('TRADE', 'Executed buy order', { price: 0.45 });
 */

import { EventEmitter } from 'events';
import type { BotState, BotConfig, LogEntry, LogLevel } from './types.js';

class DashboardEmitter extends EventEmitter {
  private state: BotState | null = null;
  private config: BotConfig | null = null;
  private logs: LogEntry[] = [];
  private maxLogs = 500;

  updateState(newState: BotState): void {
    this.state = { ...newState };
    this.emit('state', this.state);
  }

  updateConfig(newConfig: BotConfig): void {
    this.config = { ...newConfig };
    this.emit('config', this.config);
  }

  updateStrategyStatus(strategy: 'arbitrage' | 'dipArb' | 'smartMoney', status: string, details?: any): void {
    if (!this.state) return;

    if (strategy === 'dipArb') {
      this.state.dipArb.status = status as any;
      if (details) this.state.dipArb.marketName = details;
    } else if (strategy === 'arbitrage') {
      this.state.arbitrage.status = status as any;
      if (details) this.state.arbitrage.currentMarket = details;
    }

    this.emit('state', this.state);
  }

  log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.emit('log', entry);
  }

  getState(): BotState | null {
    return this.state;
  }

  getConfig(): BotConfig | null {
    return this.config;
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getFullData() {
    return {
      state: this.state,
      config: this.config,
      logs: this.logs,
    };
  }

  clearLogs(): void {
    this.logs = [];
    this.emit('logs-cleared');
  }
}

export const dashboardEmitter = new DashboardEmitter();
export { DashboardEmitter };

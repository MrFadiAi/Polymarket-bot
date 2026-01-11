/**
 * Rate Limiter for Polymarket APIs
 * - Data API: 100ms minimum interval
 * - Gamma API: 10 req/s
 * - CLOB API: 10 req/s
 */

import Bottleneck from 'bottleneck';

export enum ApiType {
  DATA_API = 'data-api',
  GAMMA_API = 'gamma-api',
  CLOB_API = 'clob-api',
  SUBGRAPH = 'subgraph',
  BINANCE = 'binance',
}

const API_LIMITS: Record<ApiType, Bottleneck.ConstructorOptions> = {
  [ApiType.DATA_API]: {
    minTime: 100, // 100ms minimum interval
    maxConcurrent: 5,
  },
  [ApiType.GAMMA_API]: {
    reservoir: 10,
    reservoirRefreshAmount: 10,
    reservoirRefreshInterval: 1000,
  },
  [ApiType.CLOB_API]: {
    reservoir: 10,
    reservoirRefreshAmount: 10,
    reservoirRefreshInterval: 1000,
  },
  [ApiType.SUBGRAPH]: {
    minTime: 50, // 50ms minimum interval
    maxConcurrent: 10,
  },
  [ApiType.BINANCE]: {
    // Binance allows 1200 requests/min, we use 10 req/s to be conservative
    reservoir: 10,
    reservoirRefreshAmount: 10,
    reservoirRefreshInterval: 1000,
  },
};

export class RateLimiter {
  private limiters: Map<ApiType, Bottleneck> = new Map();

  constructor() {
    for (const [type, config] of Object.entries(API_LIMITS)) {
      this.limiters.set(type as ApiType, new Bottleneck(config));
    }
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(api: ApiType, fn: () => Promise<T>): Promise<T> {
    const limiter = this.limiters.get(api);
    if (!limiter) throw new Error(`Unknown API type: ${api}`);
    return limiter.schedule(fn);
  }

  /**
   * Execute multiple functions in order with rate limiting
   */
  async executeBatch<T>(api: ApiType, fns: (() => Promise<T>)[]): Promise<T[]> {
    const results: T[] = [];
    for (const fn of fns) {
      results.push(await this.execute(api, fn));
    }
    return results;
  }

  /**
   * Get current limiter statistics
   */
  getStats(api: ApiType): { running: number; queued: number } | null {
    const limiter = this.limiters.get(api);
    if (!limiter) return null;
    const counts = limiter.counts();
    return {
      running: counts.RUNNING,
      queued: counts.QUEUED,
    };
  }
}

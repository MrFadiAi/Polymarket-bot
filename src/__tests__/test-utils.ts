/**
 * Test Utilities for poly-sdk
 *
 * Provides mock implementations and test helpers for unit testing.
 */

import { vi } from 'vitest';

// ===== Mock Data =====

export const mockClobMarket = {
  conditionId: '0x82ace55cdcba920112a2b3548f21e6e117730144db4dd580456aaecf1a2ad751',
  question: 'Will BTC reach $100k by end of 2024?',
  description: 'This market resolves YES if Bitcoin reaches $100,000 USD.',
  marketSlug: 'will-btc-reach-100k',
  tokens: [
    {
      tokenId: '21742633143463906290569050155826241533067272736897614950488156847949938836455',
      outcome: 'Yes',
      price: 0.65,
    },
    {
      tokenId: '79707176503087022804581743747659199568535926050896809695934676056217229461419',
      outcome: 'No',
      price: 0.35,
    },
  ],
  acceptingOrders: true,
  endDateIso: '2024-12-31T23:59:59Z',
  active: true,
  closed: false,
};

export const mockOrderbook = {
  bids: [
    { price: 0.55, size: 1000 },
    { price: 0.54, size: 500 },
    { price: 0.53, size: 750 },
  ],
  asks: [
    { price: 0.57, size: 800 },
    { price: 0.58, size: 600 },
    { price: 0.59, size: 400 },
  ],
  timestamp: Date.now(),
};

export const mockNoOrderbook = {
  bids: [
    { price: 0.43, size: 900 },
    { price: 0.42, size: 450 },
  ],
  asks: [
    { price: 0.45, size: 700 },
    { price: 0.46, size: 500 },
  ],
  timestamp: Date.now(),
};

export const mockGammaMarket = {
  id: '12345',
  conditionId: '0x82ace55cdcba920112a2b3548f21e6e117730144db4dd580456aaecf1a2ad751',
  slug: 'will-btc-reach-100k',
  question: 'Will BTC reach $100k by end of 2024?',
  outcomes: ['Yes', 'No'],
  outcomePrices: [0.65, 0.35],
  volume: 5000000,
  volume24hr: 250000,
  liquidity: 100000,
  spread: 0.02,
  endDate: new Date('2024-12-31T23:59:59Z'),
  active: true,
  closed: false,
};

export const mockPosition = {
  asset: '21742633143463906290569050155826241533067272736897614950488156847949938836455',
  conditionId: '0x82ace55cdcba920112a2b3548f21e6e117730144db4dd580456aaecf1a2ad751',
  outcome: 'Yes',
  outcomeIndex: 0,
  size: 100,
  avgPrice: 0.50,
  curPrice: 0.65,
  cashPnl: 15,
  percentPnl: 0.30,
  title: 'Will BTC reach $100k?',
};

// ===== Mock RateLimiter =====

export class MockRateLimiter {
  async execute<T>(_apiType: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

// ===== Mock Cache =====

export class MockCache {
  private cache = new Map<string, { value: unknown; expires: number }>();

  async getOrSet<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value as T;
    }
    const value = await fn();
    this.cache.set(key, { value, expires: Date.now() + ttl });
    return value;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ===== Mock Fetch =====

export function createMockFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    for (const [pattern, response] of Object.entries(responses)) {
      if (path.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => response,
        };
      }
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    };
  });
}

// ===== Assertion Helpers =====

export function expectOrderbookSorted(orderbook: {
  bids: Array<{ price: number }>;
  asks: Array<{ price: number }>;
}): void {
  // Bids should be descending
  for (let i = 1; i < orderbook.bids.length; i++) {
    if (orderbook.bids[i].price > orderbook.bids[i - 1].price) {
      throw new Error('Bids are not sorted descending');
    }
  }
  // Asks should be ascending
  for (let i = 1; i < orderbook.asks.length; i++) {
    if (orderbook.asks[i].price < orderbook.asks[i - 1].price) {
      throw new Error('Asks are not sorted ascending');
    }
  }
}

// ===== Time Helpers =====

export async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

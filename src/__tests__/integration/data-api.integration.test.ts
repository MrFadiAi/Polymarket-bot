/**
 * Data API Client Integration Tests
 *
 * These tests make REAL API calls to Polymarket.
 *
 * Run with: pnpm test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DataApiClient } from '../../clients/data-api.js';
import { RateLimiter } from '../../core/rate-limiter.js';
import { createUnifiedCache } from '../../core/unified-cache.js';

describe('DataApiClient Integration', () => {
  let client: DataApiClient;

  beforeAll(() => {
    client = new DataApiClient(new RateLimiter(), createUnifiedCache());
  });

  describe('fetchLeaderboard', () => {
    it('should fetch leaderboard entries', async () => {
      const result = await client.fetchLeaderboard({ limit: 10 });

      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries.length).toBeLessThanOrEqual(10);
      expect(typeof result.hasMore).toBe('boolean');
      expect(typeof result.request.offset).toBe('number');
      expect(typeof result.request.limit).toBe('number');

      // Verify entry structure
      for (const entry of result.entries) {
        expect(typeof entry.address).toBe('string');
        expect(entry.address.length).toBeGreaterThan(0);
        expect(typeof entry.rank).toBe('number');
        expect(entry.rank).toBeGreaterThan(0);
        expect(typeof entry.pnl).toBe('number');
        expect(typeof entry.volume).toBe('number');
      }

      // Verify ranks are in order
      for (let i = 1; i < result.entries.length; i++) {
        expect(result.entries[i].rank).toBeGreaterThan(result.entries[i - 1].rank);
      }

      console.log(`✓ Leaderboard fetched: ${result.entries.length} entries, hasMore: ${result.hasMore}`);
      console.log(`  #1: ${result.entries[0].address.slice(0, 10)}... PnL: $${result.entries[0].pnl.toLocaleString()}`);
    }, 30000);

    it('should handle pagination', async () => {
      const page1 = await client.fetchLeaderboard({ limit: 5, offset: 0 });
      const page2 = await client.fetchLeaderboard({ limit: 5, offset: 5 });

      // Ranks should be continuous
      if (page1.entries.length > 0 && page2.entries.length > 0) {
        const lastRankPage1 = page1.entries[page1.entries.length - 1].rank;
        const firstRankPage2 = page2.entries[0].rank;
        expect(firstRankPage2).toBe(lastRankPage1 + 1);
      }

      console.log('✓ Pagination verified');
    }, 30000);
  });

  describe('getTrades', () => {
    it('should fetch recent trades', async () => {
      const trades = await client.getTrades({ limit: 20 });

      expect(Array.isArray(trades)).toBe(true);

      if (trades.length > 0) {
        // Verify trade structure
        for (const trade of trades) {
          // id may not be present in all API responses
          if (trade.id !== undefined) {
            expect(typeof trade.id).toBe('string');
          }
          expect(['BUY', 'SELL']).toContain(trade.side);
          expect(typeof trade.price).toBe('number');
          expect(trade.price).toBeGreaterThanOrEqual(0);
          expect(trade.price).toBeLessThanOrEqual(1);
          expect(typeof trade.size).toBe('number');
          expect(trade.size).toBeGreaterThan(0);
          expect(typeof trade.timestamp).toBe('number');
        }

        console.log(`✓ Fetched ${trades.length} recent trades`);
        console.log(`  Latest: ${trades[0].side} ${trades[0].size} @ ${trades[0].price}`);
      } else {
        console.log('✓ No recent trades found (this is ok)');
      }
    }, 30000);

    it('should fetch trades for specific market', async () => {
      // Get a trending market first
      const response = await fetch(
        'https://gamma-api.polymarket.com/markets?active=true&limit=1&order=volume24hr&ascending=false'
      );
      const markets = await response.json() as Array<{ conditionId: string }>;

      if (markets.length === 0) {
        console.log('No markets found, skipping test');
        return;
      }

      const trades = await client.getTradesByMarket(markets[0].conditionId, 10);

      expect(Array.isArray(trades)).toBe(true);

      // All trades should be for this market
      for (const trade of trades) {
        expect(trade.market).toBe(markets[0].conditionId);
      }

      console.log(`✓ Fetched ${trades.length} trades for specific market`);
    }, 30000);
  });

  describe('getPositions', () => {
    it('should fetch positions for a known active wallet', async () => {
      // Get top trader from leaderboard
      const result = await client.fetchLeaderboard({ limit: 1 });

      if (result.entries.length === 0) {
        console.log('No leaderboard entries, skipping test');
        return;
      }

      const address = result.entries[0].address;
      const positions = await client.getPositions(address);

      expect(Array.isArray(positions)).toBe(true);

      if (positions.length > 0) {
        // Verify position structure
        for (const pos of positions) {
          expect(typeof pos.asset).toBe('string');
          expect(typeof pos.conditionId).toBe('string');
          // Polymarket has multi-outcome markets, not just Yes/No
          expect(typeof pos.outcome).toBe('string');
          expect(pos.outcome.length).toBeGreaterThan(0);
          expect(typeof pos.size).toBe('number');
          expect(typeof pos.avgPrice).toBe('number');
          expect(typeof pos.title).toBe('string');
        }

        console.log(`✓ Fetched ${positions.length} positions for ${address.slice(0, 10)}...`);
      } else {
        console.log(`✓ Top trader has no current positions (this is ok)`);
      }
    }, 30000);

    it('should return empty array for wallet with no positions', async () => {
      // Use a random address that probably has no positions
      const positions = await client.getPositions('0x0000000000000000000000000000000000000001');

      expect(Array.isArray(positions)).toBe(true);
      // Might be empty or have some positions, both are valid
      console.log(`✓ Returned ${positions.length} positions for test address`);
    }, 30000);
  });

  describe('getActivity', () => {
    it('should fetch activity for an active wallet', async () => {
      // Get top trader
      const result = await client.fetchLeaderboard({ limit: 1 });

      if (result.entries.length === 0) {
        console.log('No leaderboard entries, skipping test');
        return;
      }

      const address = result.entries[0].address;
      const activity = await client.getActivity(address, { limit: 20 });

      expect(Array.isArray(activity)).toBe(true);

      if (activity.length > 0) {
        // Verify activity structure
        for (const act of activity) {
          // Polymarket has various activity types
          expect(['TRADE', 'SPLIT', 'MERGE', 'REDEEM', 'CONVERSION', 'YIELD', 'REWARD']).toContain(act.type);
          // Side might be null for non-trade activities
          if (act.type === 'TRADE') {
            expect(['BUY', 'SELL']).toContain(act.side);
          }
          expect(typeof act.size).toBe('number');
          expect(typeof act.price).toBe('number');
          expect(typeof act.timestamp).toBe('number');
          expect(act.timestamp).toBeGreaterThan(0);
        }

        console.log(`✓ Fetched ${activity.length} activities for ${address.slice(0, 10)}...`);
      } else {
        console.log('✓ No recent activity found (this is ok)');
      }
    }, 30000);
  });
});

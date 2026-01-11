/**
 * Gamma API Client Integration Tests
 *
 * These tests make REAL API calls to Polymarket.
 *
 * Run with: pnpm test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GammaApiClient } from '../../clients/gamma-api.js';
import { RateLimiter } from '../../core/rate-limiter.js';
import { createUnifiedCache } from '../../core/unified-cache.js';

describe('GammaApiClient Integration', () => {
  let client: GammaApiClient;

  beforeAll(() => {
    client = new GammaApiClient(new RateLimiter(), createUnifiedCache());
  });

  describe('getMarkets', () => {
    it('should fetch active markets sorted by volume', async () => {
      const markets = await client.getMarkets({
        active: true,
        closed: false,
        order: 'volume24hr',
        ascending: false,
        limit: 10,
      });

      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
      expect(markets.length).toBeLessThanOrEqual(10);

      // Verify each market structure
      for (const market of markets) {
        expect(typeof market.id).toBe('string');
        expect(typeof market.conditionId).toBe('string');
        expect(typeof market.question).toBe('string');
        expect(market.question.length).toBeGreaterThan(0);
        expect(Array.isArray(market.outcomes)).toBe(true);
        expect(Array.isArray(market.outcomePrices)).toBe(true);
        expect(typeof market.volume).toBe('number');
        expect(typeof market.active).toBe('boolean');
        expect(market.active).toBe(true);  // We filtered for active
      }

      // Verify volume24hr is sorted descending
      for (let i = 1; i < markets.length; i++) {
        const prev = markets[i - 1].volume24hr ?? 0;
        const curr = markets[i].volume24hr ?? 0;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }

      console.log(`✓ Fetched ${markets.length} active markets sorted by 24h volume`);
      console.log(`  Top market: "${markets[0].question.slice(0, 50)}..."`);
      console.log(`  24h volume: $${markets[0].volume24hr?.toLocaleString()}`);
    }, 30000);

    it('should return correct outcome prices', async () => {
      const markets = await client.getMarkets({
        active: true,
        limit: 5,
      });

      for (const market of markets) {
        // Outcome prices should be between 0 and 1
        for (const price of market.outcomePrices) {
          expect(price).toBeGreaterThanOrEqual(0);
          expect(price).toBeLessThanOrEqual(1);
        }

        // For binary markets, prices should roughly sum to 1
        // But some markets might have no liquidity (0 prices)
        if (market.outcomes.length === 2) {
          const sum = market.outcomePrices.reduce((a, b) => a + b, 0);
          // Allow for no liquidity (0) or normal spread
          if (sum > 0) {
            expect(sum).toBeGreaterThan(0.8);
            expect(sum).toBeLessThan(1.2);
          }
        }
      }

      console.log('✓ Outcome prices validated for all markets');
    }, 30000);

    it('should handle pagination correctly', async () => {
      const page1 = await client.getMarkets({
        active: true,
        limit: 5,
        offset: 0,
      });

      const page2 = await client.getMarkets({
        active: true,
        limit: 5,
        offset: 5,
      });

      // Pages should have different markets
      const page1Ids = new Set(page1.map(m => m.id));
      const page2Ids = new Set(page2.map(m => m.id));

      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }

      console.log(`✓ Pagination works: page1 has ${page1.length} markets, page2 has ${page2.length} markets`);
    }, 30000);
  });

  describe('getTrendingMarkets', () => {
    it('should return trending markets by 24h volume', async () => {
      const trending = await client.getTrendingMarkets(10);

      expect(trending.length).toBeGreaterThan(0);

      // Should all be active and not closed
      for (const market of trending) {
        expect(market.active).toBe(true);
        expect(market.closed).toBe(false);
      }

      // Should be sorted by volume24hr descending
      for (let i = 1; i < trending.length; i++) {
        const prev = trending[i - 1].volume24hr ?? 0;
        const curr = trending[i].volume24hr ?? 0;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }

      console.log(`✓ Top ${trending.length} trending markets retrieved`);
    }, 30000);
  });

  describe('getEvents', () => {
    it('should fetch events with associated markets', async () => {
      const events = await client.getEvents({
        active: true,
        limit: 5,
      });

      expect(Array.isArray(events)).toBe(true);

      if (events.length > 0) {
        const event = events[0];

        expect(typeof event.id).toBe('string');
        expect(typeof event.title).toBe('string');
        expect(event.title.length).toBeGreaterThan(0);
        expect(Array.isArray(event.markets)).toBe(true);

        console.log(`✓ Fetched ${events.length} events`);
        console.log(`  First event: "${event.title}"`);
        console.log(`  Markets in event: ${event.markets.length}`);
      } else {
        console.log('✓ No active events found (this is ok)');
      }
    }, 30000);
  });

  describe('getMarketBySlug', () => {
    it('should find market by slug', async () => {
      // First get a market to know its slug
      const markets = await client.getMarkets({ active: true, limit: 1 });

      if (markets.length === 0) {
        console.log('No markets found, skipping test');
        return;
      }

      const slug = markets[0].slug;
      const market = await client.getMarketBySlug(slug);

      expect(market).not.toBeNull();
      expect(market?.slug).toBe(slug);
      expect(market?.question).toBe(markets[0].question);

      console.log(`✓ Found market by slug: "${slug}"`);
    }, 30000);

    it('should return null for non-existent slug', async () => {
      const market = await client.getMarketBySlug('this-market-definitely-does-not-exist-12345');
      expect(market).toBeNull();
    }, 30000);
  });

  describe('getMarketByConditionId', () => {
    it('should find market by condition ID', async () => {
      const markets = await client.getMarkets({ active: true, limit: 1 });

      if (markets.length === 0) {
        console.log('No markets found, skipping test');
        return;
      }

      const conditionId = markets[0].conditionId;
      const market = await client.getMarketByConditionId(conditionId);

      expect(market).not.toBeNull();
      expect(market?.conditionId).toBe(conditionId);

      console.log(`✓ Found market by conditionId: "${conditionId.slice(0, 20)}..."`);
    }, 30000);
  });
});

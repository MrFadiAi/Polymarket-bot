/**
 * TradingService Integration Tests
 *
 * Tests the TradingService for trading operations.
 * Note: Market data methods have been moved to MarketService.
 *
 * Run with: pnpm test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { TradingService } from '../../services/trading-service.js';
import { RateLimiter } from '../../core/rate-limiter.js';
import { createUnifiedCache } from '../../core/unified-cache.js';

describe('TradingService Integration', () => {
  let service: TradingService;
  let testYesTokenId: string;

  beforeAll(async () => {
    // Create service with a dummy private key for read-only operations
    service = new TradingService(new RateLimiter(), createUnifiedCache(), {
      privateKey: '0x' + '1'.repeat(64), // Dummy key for read-only
    });

    // Initialize the service
    await service.initialize();

    // Find a liquid market for testing via Gamma API
    const response = await fetch(
      'https://gamma-api.polymarket.com/markets?active=true&limit=1&order=volume24hr&ascending=false'
    );
    const markets = (await response.json()) as Array<{
      conditionId: string;
      clobTokenIds: string;
    }>;

    if (markets.length === 0) {
      throw new Error('No markets found for testing');
    }

    // Parse clobTokenIds (Gamma API returns it as JSON string)
    const clobTokenIds = JSON.parse(markets[0].clobTokenIds) as string[];

    if (!clobTokenIds || clobTokenIds.length === 0) {
      throw new Error('No token IDs found in market');
    }

    // First token is typically the YES token
    testYesTokenId = clobTokenIds[0];
  }, 60000);

  describe('getTickSize', () => {
    it('should return valid tick size', async () => {
      const tickSize = await service.getTickSize(testYesTokenId);

      expect(typeof tickSize).toBe('string');
      expect(['0.01', '0.001', '0.0001']).toContain(tickSize);

      console.log(`✓ getTickSize: ${tickSize}`);
    }, 30000);
  });

  describe('service state', () => {
    it('should report initialized status', () => {
      expect(service.isInitialized()).toBe(true);
    });

    it('should have a wallet address', () => {
      const address = service.getAddress();
      expect(typeof address).toBe('string');
      expect(address.startsWith('0x')).toBe(true);
      expect(address.length).toBe(42);

      console.log(`✓ Wallet address: ${address.slice(0, 10)}...`);
    });
  });
});

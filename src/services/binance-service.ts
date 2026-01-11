/**
 * Binance Service
 *
 * Provides BTC/ETH/SOL K-line data from Binance public API.
 * Used for:
 * - Token vs underlying price correlation analysis
 * - Price prediction for UP/DOWN markets
 * - Backtesting strategies
 *
 * API Reference: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
 */

import { RateLimiter, ApiType } from '../core/rate-limiter.js';
import type { UnifiedCache } from '../core/unified-cache.js';
import { CACHE_TTL } from '../core/cache.js';
import { PolymarketError, ErrorCode } from '../core/errors.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Binance K-Line (OHLCV) data
 */
export interface BinanceKLine {
  /** Open time (Unix ms) */
  timestamp: number;
  /** Open price */
  open: number;
  /** High price */
  high: number;
  /** Low price */
  low: number;
  /** Close price */
  close: number;
  /** Base asset volume */
  volume: number;
  /** Close time (Unix ms) */
  closeTime: number;
  /** Quote asset volume */
  quoteVolume: number;
  /** Number of trades */
  trades: number;
}

/**
 * Supported Binance trading pairs
 */
export type BinanceSymbol = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT';

/**
 * Supported K-line intervals
 */
export type BinanceInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

/**
 * Options for getKLines
 */
export interface BinanceKLineOptions {
  /** Start time (Unix ms) */
  startTime?: number;
  /** End time (Unix ms) */
  endTime?: number;
  /** Number of candles (default 500, max 1000) */
  limit?: number;
}

/**
 * Binance API error response
 */
interface BinanceApiError {
  code: number;
  msg: string;
}

// ============================================================================
// Constants
// ============================================================================

const BINANCE_BASE_URL = 'https://api.binance.com';
const BINANCE_KLINES_ENDPOINT = '/api/v3/klines';
const BINANCE_PRICE_ENDPOINT = '/api/v3/ticker/price';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

// Valid symbols
const VALID_SYMBOLS: Set<BinanceSymbol> = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);

// Valid intervals
const VALID_INTERVALS: Set<BinanceInterval> = new Set([
  '1m', '5m', '15m', '30m', '1h', '4h', '1d',
]);

// ============================================================================
// BinanceService Implementation
// ============================================================================

export class BinanceService {
  constructor(
    private rateLimiter: RateLimiter,
    private cache: UnifiedCache
  ) {}

  /**
   * Get K-lines (candlestick data) for a symbol
   *
   * @param symbol - Trading pair (BTCUSDT, ETHUSDT, SOLUSDT)
   * @param interval - K-line interval
   * @param options - Optional parameters
   * @returns Array of K-line candles
   *
   * @example
   * ```typescript
   * const klines = await binanceService.getKLines('BTCUSDT', '1h', { limit: 100 });
   * console.log(`Latest close: ${klines[klines.length - 1].close}`);
   * ```
   */
  async getKLines(
    symbol: BinanceSymbol,
    interval: BinanceInterval,
    options?: BinanceKLineOptions
  ): Promise<BinanceKLine[]> {
    // Validate inputs
    this.validateSymbol(symbol);
    this.validateInterval(interval);

    const limit = Math.min(options?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    // Build cache key
    const cacheKey = this.buildKLineCacheKey(symbol, interval, options);

    return this.cache.getOrSet(cacheKey, CACHE_TTL.BINANCE_KLINE, async () => {
      return this.rateLimiter.execute(ApiType.BINANCE, async () => {
        const url = this.buildKLinesUrl(symbol, interval, {
          ...options,
          limit,
        });

        const response = await fetch(url);

        if (!response.ok) {
          await this.handleApiError(response);
        }

        const data = await response.json() as unknown[][];
        return this.parseKLines(data);
      });
    });
  }

  /**
   * Get current price for a symbol
   *
   * @param symbol - Trading pair (BTCUSDT, ETHUSDT, SOLUSDT)
   * @returns Current price
   *
   * @example
   * ```typescript
   * const price = await binanceService.getPrice('BTCUSDT');
   * console.log(`BTC price: $${price}`);
   * ```
   */
  async getPrice(symbol: BinanceSymbol): Promise<number> {
    this.validateSymbol(symbol);

    const cacheKey = `binance:price:${symbol}`;

    return this.cache.getOrSet(cacheKey, CACHE_TTL.BINANCE_PRICE, async () => {
      return this.rateLimiter.execute(ApiType.BINANCE, async () => {
        const url = `${BINANCE_BASE_URL}${BINANCE_PRICE_ENDPOINT}?symbol=${symbol}`;

        const response = await fetch(url);

        if (!response.ok) {
          await this.handleApiError(response);
        }

        const data = await response.json() as { symbol: string; price: string };
        return parseFloat(data.price);
      });
    });
  }

  /**
   * Get price at a specific timestamp (nearest candle close)
   *
   * Uses the 1-minute candle that contains the timestamp and returns
   * the close price of that candle.
   *
   * @param symbol - Trading pair (BTCUSDT, ETHUSDT, SOLUSDT)
   * @param timestamp - Unix timestamp in milliseconds
   * @returns Price at the given timestamp
   *
   * @example
   * ```typescript
   * // Get BTC price 1 hour ago
   * const oneHourAgo = Date.now() - 60 * 60 * 1000;
   * const price = await binanceService.getPriceAt('BTCUSDT', oneHourAgo);
   * ```
   */
  async getPriceAt(symbol: BinanceSymbol, timestamp: number): Promise<number> {
    this.validateSymbol(symbol);

    // Fetch a single 1-minute candle at the specified time
    const klines = await this.getKLines(symbol, '1m', {
      startTime: timestamp,
      limit: 1,
    });

    if (klines.length === 0) {
      throw new PolymarketError(
        ErrorCode.INVALID_RESPONSE,
        `No price data available for ${symbol} at timestamp ${timestamp}`
      );
    }

    return klines[0].close;
  }

  /**
   * Get multiple prices at once
   *
   * @param symbols - Array of trading pairs
   * @returns Map of symbol to price
   */
  async getPrices(symbols: BinanceSymbol[]): Promise<Map<BinanceSymbol, number>> {
    const prices = await Promise.all(
      symbols.map(async (symbol) => {
        const price = await this.getPrice(symbol);
        return [symbol, price] as const;
      })
    );

    return new Map(prices);
  }

  /**
   * Get price change over a time period
   *
   * @param symbol - Trading pair
   * @param startTime - Start time (Unix ms)
   * @param endTime - End time (Unix ms, defaults to now)
   * @returns Price change percentage
   */
  async getPriceChange(
    symbol: BinanceSymbol,
    startTime: number,
    endTime?: number
  ): Promise<{ startPrice: number; endPrice: number; changePercent: number }> {
    const [startKlines, endKlines] = await Promise.all([
      this.getKLines(symbol, '1m', { startTime, limit: 1 }),
      endTime
        ? this.getKLines(symbol, '1m', { startTime: endTime, limit: 1 })
        : Promise.resolve([]),
    ]);

    const startPrice = startKlines[0]?.close;
    if (!startPrice) {
      throw new PolymarketError(
        ErrorCode.INVALID_RESPONSE,
        `No price data for ${symbol} at ${startTime}`
      );
    }

    const endPrice = endKlines[0]?.close ?? (await this.getPrice(symbol));
    const changePercent = ((endPrice - startPrice) / startPrice) * 100;

    return { startPrice, endPrice, changePercent };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private validateSymbol(symbol: string): asserts symbol is BinanceSymbol {
    if (!VALID_SYMBOLS.has(symbol as BinanceSymbol)) {
      throw new PolymarketError(
        ErrorCode.INVALID_CONFIG,
        `Invalid symbol: ${symbol}. Supported: ${[...VALID_SYMBOLS].join(', ')}`
      );
    }
  }

  private validateInterval(interval: string): asserts interval is BinanceInterval {
    if (!VALID_INTERVALS.has(interval as BinanceInterval)) {
      throw new PolymarketError(
        ErrorCode.INVALID_CONFIG,
        `Invalid interval: ${interval}. Supported: ${[...VALID_INTERVALS].join(', ')}`
      );
    }
  }

  private buildKLineCacheKey(
    symbol: BinanceSymbol,
    interval: BinanceInterval,
    options?: BinanceKLineOptions
  ): string {
    const parts = ['binance', 'klines', symbol, interval];

    if (options?.startTime) {
      parts.push(`start:${options.startTime}`);
    }
    if (options?.endTime) {
      parts.push(`end:${options.endTime}`);
    }
    if (options?.limit) {
      parts.push(`limit:${options.limit}`);
    }

    return parts.join(':');
  }

  private buildKLinesUrl(
    symbol: BinanceSymbol,
    interval: BinanceInterval,
    options?: BinanceKLineOptions
  ): string {
    const params = new URLSearchParams({
      symbol,
      interval,
    });

    if (options?.startTime) {
      params.set('startTime', options.startTime.toString());
    }
    if (options?.endTime) {
      params.set('endTime', options.endTime.toString());
    }
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }

    return `${BINANCE_BASE_URL}${BINANCE_KLINES_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Parse Binance K-line array response
   *
   * Binance returns K-lines as arrays:
   * [
   *   [
   *     1499040000000,      // Open time
   *     "0.01634000",       // Open
   *     "0.80000000",       // High
   *     "0.01575800",       // Low
   *     "0.01577100",       // Close
   *     "148976.11427815",  // Volume
   *     1499644799999,      // Close time
   *     "2434.19055334",    // Quote asset volume
   *     308,                // Number of trades
   *     "1756.87402397",    // Taker buy base asset volume
   *     "28.46694368",      // Taker buy quote asset volume
   *     "17928899.62484339" // Ignore
   *   ]
   * ]
   */
  private parseKLines(data: unknown[][]): BinanceKLine[] {
    return data.map((kline) => ({
      timestamp: kline[0] as number,
      open: parseFloat(kline[1] as string),
      high: parseFloat(kline[2] as string),
      low: parseFloat(kline[3] as string),
      close: parseFloat(kline[4] as string),
      volume: parseFloat(kline[5] as string),
      closeTime: kline[6] as number,
      quoteVolume: parseFloat(kline[7] as string),
      trades: kline[8] as number,
    }));
  }

  private async handleApiError(response: Response): Promise<never> {
    let errorBody: BinanceApiError | null = null;

    try {
      errorBody = await response.json() as BinanceApiError;
    } catch {
      // Failed to parse error body
    }

    const message = errorBody?.msg || `Binance API error: HTTP ${response.status}`;

    // Handle rate limiting
    if (response.status === 429 || errorBody?.code === -1015) {
      throw new PolymarketError(
        ErrorCode.RATE_LIMITED,
        message,
        true // retryable
      );
    }

    // Handle invalid symbol/parameters
    if (errorBody?.code === -1121 || errorBody?.code === -1100) {
      throw new PolymarketError(
        ErrorCode.INVALID_CONFIG,
        message,
        false
      );
    }

    // Generic API error
    throw new PolymarketError(
      ErrorCode.API_ERROR,
      message,
      response.status >= 500 // retryable for server errors
    );
  }
}

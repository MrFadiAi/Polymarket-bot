/**
 * Unified error handling for Polymarket SDK
 */

export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',

  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  API_KEY_EXPIRED = 'API_KEY_EXPIRED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',

  // Data errors
  MARKET_NOT_FOUND = 'MARKET_NOT_FOUND',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  INVALID_RESPONSE = 'INVALID_RESPONSE',

  // Trading errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  ORDER_REJECTED = 'ORDER_REJECTED',
  ORDER_FAILED = 'ORDER_FAILED',
  MARKET_CLOSED = 'MARKET_CLOSED',

  // API errors
  API_ERROR = 'API_ERROR',

  // Internal errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
}

export class PolymarketError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'PolymarketError';
  }

  /**
   * Create error from HTTP response status
   */
  static fromHttpError(status: number, body?: unknown): PolymarketError {
    const bodyMessage =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : '';

    switch (status) {
      case 429:
        return new PolymarketError(
          ErrorCode.RATE_LIMITED,
          bodyMessage || 'Rate limited',
          true
        );
      case 401:
        return new PolymarketError(
          ErrorCode.AUTH_FAILED,
          bodyMessage || 'Authentication failed'
        );
      case 403:
        return new PolymarketError(
          ErrorCode.AUTH_FAILED,
          bodyMessage || 'Forbidden'
        );
      case 404:
        return new PolymarketError(
          ErrorCode.MARKET_NOT_FOUND,
          bodyMessage || 'Resource not found'
        );
      case 400:
        return new PolymarketError(
          ErrorCode.INVALID_RESPONSE,
          bodyMessage || 'Bad request'
        );
      default:
        return new PolymarketError(
          ErrorCode.NETWORK_ERROR,
          bodyMessage || `HTTP ${status}`,
          status >= 500
        );
    }
  }
}

/**
 * Retry decorator for async functions
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000 } = options;

  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (error instanceof PolymarketError && !error.retryable) {
        throw error;
      }
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
}

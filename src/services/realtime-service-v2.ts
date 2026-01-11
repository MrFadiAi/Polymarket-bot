/**
 * RealtimeService V2
 *
 * Comprehensive real-time data service using official @polymarket/real-time-data-client.
 *
 * Supports ALL available topics:
 * - clob_market: price_change, agg_orderbook, last_trade_price, tick_size_change, market_created, market_resolved
 * - clob_user: order, trade (requires authentication)
 * - activity: trades, orders_matched
 * - crypto_prices: update (BTC, ETH, etc.)
 * - equity_prices: update (AAPL, etc.)
 * - comments: comment_created, comment_removed, reaction_created, reaction_removed
 * - rfq: request_*, quote_*
 */

import { EventEmitter } from 'events';
import {
  RealTimeDataClient,
  type Message,
  type ClobApiKeyCreds,
  ConnectionStatus,
} from '@polymarket/real-time-data-client';
import type { PriceUpdate, BookUpdate, Orderbook, OrderbookLevel } from '../core/types.js';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeServiceConfig {
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Ping interval in ms (default: 5000) */
  pingInterval?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

// Market data types
/**
 * Extended orderbook snapshot from WebSocket with additional trading parameters.
 * Extends the base Orderbook type from core/types.ts.
 */
export interface OrderbookSnapshot extends Orderbook {
  /** Token ID (ERC-1155 token identifier, required in WebSocket context) */
  tokenId: string;
  /** @deprecated Use tokenId instead */
  assetId: string;
  /** Market condition ID (required in WebSocket context) */
  market: string;
  /** Tick size for price rounding */
  tickSize: string;
  /** Minimum order size */
  minOrderSize: string;
  /** Hash for change detection (required in WebSocket context) */
  hash: string;
}

export interface LastTradeInfo {
  assetId: string;
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
  timestamp: number;
}

export interface PriceChange {
  assetId: string;
  changes: Array<{ price: string; size: string }>;
  timestamp: number;
}

export interface TickSizeChange {
  assetId: string;
  oldTickSize: string;
  newTickSize: string;
  timestamp: number;
}

export interface MarketEvent {
  conditionId: string;
  type: 'created' | 'resolved';
  data: Record<string, unknown>;
  timestamp: number;
}

// User data types (requires authentication)
export interface UserOrder {
  orderId: string;
  market: string;
  asset: string;
  side: 'BUY' | 'SELL';
  price: number;
  originalSize: number;
  matchedSize: number;
  eventType: 'PLACEMENT' | 'UPDATE' | 'CANCELLATION';
  timestamp: number;
}

export interface UserTrade {
  tradeId: string;
  market: string;
  outcome: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  status: 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED';
  timestamp: number;
  transactionHash?: string;
}

// Activity types
/**
 * Activity trade from WebSocket
 *
 * 实测验证 (2025-12-28)：proxyWallet 和 name 是顶层字段，不在 trader 对象里
 */
export interface ActivityTrade {
  /** Token ID (用于下单) */
  asset: string;
  /** Market condition ID */
  conditionId: string;
  /** Event slug */
  eventSlug: string;
  /** Market slug (可用于过滤) */
  marketSlug: string;
  /** Outcome (Yes/No) */
  outcome: string;
  /** Trade price */
  price: number;
  /** Trade side */
  side: 'BUY' | 'SELL';
  /** Trade size in shares */
  size: number;
  /** Timestamp (Unix seconds) */
  timestamp: number;
  /** Transaction hash */
  transactionHash: string;

  // ========== 交易者信息 ==========

  /**
   * Trader info object - 用于 Copy Trading 过滤目标钱包
   *
   * 注意: 实测验证 (2025-12-28) 数据结构为:
   * {
   *   trader: { name: "username", address: "0x..." }
   * }
   * 而非顶层 proxyWallet
   */
  trader?: {
    /** 交易者用户名 */
    name?: string;
    /** 交易者钱包地址 - Copy Trading 过滤关键字段！ */
    address?: string;
  };
}

// External price types
export interface CryptoPrice {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface EquityPrice {
  symbol: string;
  price: number;
  timestamp: number;
}

// Comment types
export interface Comment {
  id: string;
  parentEntityId: number;
  parentEntityType: 'Event' | 'Series';
  content?: string;
  author?: string;
  timestamp: number;
}

export interface Reaction {
  id: string;
  commentId: string;
  type: string;
  author?: string;
  timestamp: number;
}

// RFQ types
export interface RFQRequest {
  id: string;
  market: string;
  side: 'BUY' | 'SELL';
  size: number;
  status: 'created' | 'edited' | 'canceled' | 'expired';
  timestamp: number;
}

export interface RFQQuote {
  id: string;
  requestId: string;
  price: number;
  size: number;
  status: 'created' | 'edited' | 'canceled' | 'expired';
  timestamp: number;
}

// Subscription types
export interface Subscription {
  id: string;
  topic: string;
  type: string;
  unsubscribe: () => void;
}

export interface MarketSubscription extends Subscription {
  tokenIds: string[];
}

// Event handler types
export interface MarketDataHandlers {
  onOrderbook?: (book: OrderbookSnapshot) => void;
  onPriceChange?: (change: PriceChange) => void;
  onLastTrade?: (trade: LastTradeInfo) => void;
  onTickSizeChange?: (change: TickSizeChange) => void;
  onMarketEvent?: (event: MarketEvent) => void;
  onError?: (error: Error) => void;
}

export interface UserDataHandlers {
  onOrder?: (order: UserOrder) => void;
  onTrade?: (trade: UserTrade) => void;
  onError?: (error: Error) => void;
}

export interface ActivityHandlers {
  onTrade?: (trade: ActivityTrade) => void;
  onError?: (error: Error) => void;
}

export interface CryptoPriceHandlers {
  onPrice?: (price: CryptoPrice) => void;
  onError?: (error: Error) => void;
}

export interface EquityPriceHandlers {
  onPrice?: (price: EquityPrice) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// RealtimeServiceV2 Implementation
// ============================================================================

export class RealtimeServiceV2 extends EventEmitter {
  private client: RealTimeDataClient | null = null;
  private config: RealtimeServiceConfig;
  private subscriptions: Map<string, Subscription> = new Map();
  private subscriptionIdCounter = 0;
  private connected = false;

  // Store subscription messages for reconnection
  private subscriptionMessages: Map<string, { subscriptions: Array<{ topic: string; type: string; filters?: string; clob_auth?: ClobApiKeyCreds }> }> = new Map();

  // Caches
  private priceCache: Map<string, PriceUpdate> = new Map();
  private bookCache: Map<string, OrderbookSnapshot> = new Map();
  private lastTradeCache: Map<string, LastTradeInfo> = new Map();

  constructor(config: RealtimeServiceConfig = {}) {
    super();
    this.config = {
      autoReconnect: config.autoReconnect ?? true,
      pingInterval: config.pingInterval ?? 5000,
      debug: config.debug ?? false,
    };
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to WebSocket server
   */
  connect(): this {
    if (this.client) {
      this.log('Already connected or connecting');
      return this;
    }

    this.client = new RealTimeDataClient({
      onConnect: this.handleConnect.bind(this),
      onMessage: this.handleMessage.bind(this),
      onStatusChange: this.handleStatusChange.bind(this),
      autoReconnect: this.config.autoReconnect,
      pingInterval: this.config.pingInterval,
    });

    this.client.connect();
    return this;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
      this.connected = false;
      this.subscriptions.clear();
      this.subscriptionMessages.clear();  // Clear reconnection list
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================================
  // Market Data Subscriptions (clob_market)
  // ============================================================================

  /**
   * Subscribe to market data (orderbook, prices, trades)
   * @param tokenIds - Array of token IDs to subscribe to
   * @param handlers - Event handlers
   */
  subscribeMarkets(tokenIds: string[], handlers: MarketDataHandlers = {}): MarketSubscription {
    const subId = `market_${++this.subscriptionIdCounter}`;
    const filterStr = JSON.stringify(tokenIds);

    // Subscribe to all market data types
    const subscriptions = [
      { topic: 'clob_market', type: 'agg_orderbook', filters: filterStr },
      { topic: 'clob_market', type: 'price_change', filters: filterStr },
      { topic: 'clob_market', type: 'last_trade_price', filters: filterStr },
      { topic: 'clob_market', type: 'tick_size_change', filters: filterStr },
    ];

    const subMsg = { subscriptions };
    this.sendSubscription(subMsg);
    this.subscriptionMessages.set(subId, subMsg);  // Store for reconnection

    // Register handlers
    const orderbookHandler = (book: OrderbookSnapshot) => {
      if (tokenIds.includes(book.assetId)) {
        handlers.onOrderbook?.(book);
      }
    };

    const priceChangeHandler = (change: PriceChange) => {
      if (tokenIds.includes(change.assetId)) {
        handlers.onPriceChange?.(change);
      }
    };

    const lastTradeHandler = (trade: LastTradeInfo) => {
      if (tokenIds.includes(trade.assetId)) {
        handlers.onLastTrade?.(trade);
      }
    };

    const tickSizeHandler = (change: TickSizeChange) => {
      if (tokenIds.includes(change.assetId)) {
        handlers.onTickSizeChange?.(change);
      }
    };

    this.on('orderbook', orderbookHandler);
    this.on('priceChange', priceChangeHandler);
    this.on('lastTrade', lastTradeHandler);
    this.on('tickSizeChange', tickSizeHandler);

    const subscription: MarketSubscription = {
      id: subId,
      topic: 'clob_market',
      type: '*',
      tokenIds,
      unsubscribe: () => {
        this.off('orderbook', orderbookHandler);
        this.off('priceChange', priceChangeHandler);
        this.off('lastTrade', lastTradeHandler);
        this.off('tickSizeChange', tickSizeHandler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
        this.subscriptionMessages.delete(subId);  // Remove from reconnection list
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  /**
   * Subscribe to a single market (YES + NO tokens)
   * Also emits derived price updates compatible with old API
   */
  subscribeMarket(
    yesTokenId: string,
    noTokenId: string,
    handlers: MarketDataHandlers & {
      onPriceUpdate?: (update: PriceUpdate) => void;
      onBookUpdate?: (update: BookUpdate) => void;
      onPairUpdate?: (update: { yes: PriceUpdate; no: PriceUpdate; spread: number }) => void;
    } = {}
  ): MarketSubscription {
    let lastYesUpdate: PriceUpdate | undefined;
    let lastNoUpdate: PriceUpdate | undefined;

    const checkPairUpdate = () => {
      if (lastYesUpdate && lastNoUpdate && handlers.onPairUpdate) {
        handlers.onPairUpdate({
          yes: lastYesUpdate,
          no: lastNoUpdate,
          spread: lastYesUpdate.price + lastNoUpdate.price,
        });
      }
    };

    return this.subscribeMarkets([yesTokenId, noTokenId], {
      onOrderbook: (book) => {
        handlers.onOrderbook?.(book);

        // Convert to BookUpdate for backward compatibility
        if (handlers.onBookUpdate) {
          const bookUpdate: BookUpdate = {
            assetId: book.assetId,
            bids: book.bids,
            asks: book.asks,
            timestamp: book.timestamp,
          };
          handlers.onBookUpdate(bookUpdate);
        }

        // Calculate derived price (Polymarket display logic)
        const priceUpdate = this.calculateDerivedPrice(book.assetId, book);
        if (priceUpdate) {
          this.priceCache.set(book.assetId, priceUpdate);

          if (book.assetId === yesTokenId) {
            lastYesUpdate = priceUpdate;
          } else if (book.assetId === noTokenId) {
            lastNoUpdate = priceUpdate;
          }

          handlers.onPriceUpdate?.(priceUpdate);
          this.emit('priceUpdate', priceUpdate);
          checkPairUpdate();
        }
      },
      onLastTrade: (trade) => {
        handlers.onLastTrade?.(trade);
        this.lastTradeCache.set(trade.assetId, trade);

        // Recalculate derived price with new last trade
        const book = this.bookCache.get(trade.assetId);
        if (book) {
          const priceUpdate = this.calculateDerivedPrice(trade.assetId, book);
          if (priceUpdate) {
            this.priceCache.set(trade.assetId, priceUpdate);

            if (trade.assetId === yesTokenId) {
              lastYesUpdate = priceUpdate;
            } else if (trade.assetId === noTokenId) {
              lastNoUpdate = priceUpdate;
            }

            handlers.onPriceUpdate?.(priceUpdate);
            this.emit('priceUpdate', priceUpdate);
            checkPairUpdate();
          }
        }
      },
      onPriceChange: handlers.onPriceChange,
      onTickSizeChange: handlers.onTickSizeChange,
      onError: handlers.onError,
    });
  }

  /**
   * Subscribe to market lifecycle events (creation, resolution)
   */
  subscribeMarketEvents(handlers: { onMarketEvent?: (event: MarketEvent) => void }): Subscription {
    const subId = `market_event_${++this.subscriptionIdCounter}`;

    const subscriptions = [
      { topic: 'clob_market', type: 'market_created' },
      { topic: 'clob_market', type: 'market_resolved' },
    ];

    this.sendSubscription({ subscriptions });

    const handler = (event: MarketEvent) => handlers.onMarketEvent?.(event);
    this.on('marketEvent', handler);

    const subscription: Subscription = {
      id: subId,
      topic: 'clob_market',
      type: 'lifecycle',
      unsubscribe: () => {
        this.off('marketEvent', handler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  // ============================================================================
  // User Data Subscriptions (clob_user) - Requires Authentication
  // ============================================================================

  /**
   * Subscribe to user order and trade events
   * @param credentials - CLOB API credentials
   * @param handlers - Event handlers
   */
  subscribeUserEvents(credentials: ClobApiKeyCreds, handlers: UserDataHandlers = {}): Subscription {
    const subId = `user_${++this.subscriptionIdCounter}`;

    const subscriptions = [
      { topic: 'clob_user', type: '*', clob_auth: credentials },
    ];

    this.sendSubscription({ subscriptions });

    const orderHandler = (order: UserOrder) => handlers.onOrder?.(order);
    const tradeHandler = (trade: UserTrade) => handlers.onTrade?.(trade);

    this.on('userOrder', orderHandler);
    this.on('userTrade', tradeHandler);

    const subscription: Subscription = {
      id: subId,
      topic: 'clob_user',
      type: '*',
      unsubscribe: () => {
        this.off('userOrder', orderHandler);
        this.off('userTrade', tradeHandler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  // ============================================================================
  // Activity Subscriptions (trades, orders_matched)
  // ============================================================================

  /**
   * Subscribe to trading activity for a market or event
   * @param filter - Event or market slug (optional - if empty, subscribes to all activity)
   * @param handlers - Event handlers
   */
  subscribeActivity(
    filter: { eventSlug?: string; marketSlug?: string } = {},
    handlers: ActivityHandlers = {}
  ): Subscription {
    const subId = `activity_${++this.subscriptionIdCounter}`;

    // Build filter object with snake_case keys (as expected by the server)
    // Only include filters if we have actual filter values
    const hasFilter = filter.eventSlug || filter.marketSlug;
    const filterObj: Record<string, string> = {};
    if (filter.eventSlug) filterObj.event_slug = filter.eventSlug;
    if (filter.marketSlug) filterObj.market_slug = filter.marketSlug;

    // Create subscription objects - only include filters field if we have filters
    const subscriptions = hasFilter
      ? [
          { topic: 'activity', type: 'trades', filters: JSON.stringify(filterObj) },
          { topic: 'activity', type: 'orders_matched', filters: JSON.stringify(filterObj) },
        ]
      : [
          { topic: 'activity', type: 'trades' },
          { topic: 'activity', type: 'orders_matched' },
        ];

    this.sendSubscription({ subscriptions });

    const handler = (trade: ActivityTrade) => handlers.onTrade?.(trade);
    this.on('activityTrade', handler);

    const subscription: Subscription = {
      id: subId,
      topic: 'activity',
      type: '*',
      unsubscribe: () => {
        this.off('activityTrade', handler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  /**
   * Subscribe to ALL trading activity across all markets (no filtering)
   * This is useful for Copy Trading - monitoring Smart Money across the platform
   * @param handlers - Event handlers
   */
  subscribeAllActivity(handlers: ActivityHandlers = {}): Subscription {
    return this.subscribeActivity({}, handlers);
  }

  // ============================================================================
  // Crypto Price Subscriptions
  // ============================================================================

  /**
   * Subscribe to crypto price updates
   * @param symbols - Array of symbols (e.g., ['BTCUSDT', 'ETHUSDT'])
   * @param handlers - Event handlers
   */
  subscribeCryptoPrices(symbols: string[], handlers: CryptoPriceHandlers = {}): Subscription {
    const subId = `crypto_${++this.subscriptionIdCounter}`;

    // Subscribe to each symbol
    const subscriptions = symbols.map(symbol => ({
      topic: 'crypto_prices',
      type: 'update',
      filters: JSON.stringify({ symbol }),
    }));

    this.sendSubscription({ subscriptions });

    const handler = (price: CryptoPrice) => {
      if (symbols.includes(price.symbol)) {
        handlers.onPrice?.(price);
      }
    };
    this.on('cryptoPrice', handler);

    const subscription: Subscription = {
      id: subId,
      topic: 'crypto_prices',
      type: 'update',
      unsubscribe: () => {
        this.off('cryptoPrice', handler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  /**
   * Subscribe to Chainlink crypto prices
   * @param symbols - Array of symbols (e.g., ['ETH/USD', 'BTC/USD'])
   */
  subscribeCryptoChainlinkPrices(symbols: string[], handlers: CryptoPriceHandlers = {}): Subscription {
    const subId = `crypto_chainlink_${++this.subscriptionIdCounter}`;

    const subscriptions = symbols.map(symbol => ({
      topic: 'crypto_prices_chainlink',
      type: 'update',
      filters: JSON.stringify({ symbol }),
    }));

    const subMsg = { subscriptions };
    this.sendSubscription(subMsg);
    this.subscriptionMessages.set(subId, subMsg);  // Store for reconnection

    const handler = (price: CryptoPrice) => {
      if (symbols.includes(price.symbol)) {
        handlers.onPrice?.(price);
      }
    };
    this.on('cryptoChainlinkPrice', handler);

    const subscription: Subscription = {
      id: subId,
      topic: 'crypto_prices_chainlink',
      type: 'update',
      unsubscribe: () => {
        this.off('cryptoChainlinkPrice', handler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
        this.subscriptionMessages.delete(subId);  // Remove from reconnection list
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  // ============================================================================
  // Equity Price Subscriptions
  // ============================================================================

  /**
   * Subscribe to equity price updates
   * @param symbols - Array of symbols (e.g., ['AAPL', 'GOOGL'])
   * @param handlers - Event handlers
   */
  subscribeEquityPrices(symbols: string[], handlers: EquityPriceHandlers = {}): Subscription {
    const subId = `equity_${++this.subscriptionIdCounter}`;

    const subscriptions = symbols.map(symbol => ({
      topic: 'equity_prices',
      type: 'update',
      filters: JSON.stringify({ symbol }),
    }));

    this.sendSubscription({ subscriptions });

    const handler = (price: EquityPrice) => {
      if (symbols.includes(price.symbol)) {
        handlers.onPrice?.(price);
      }
    };
    this.on('equityPrice', handler);

    const subscription: Subscription = {
      id: subId,
      topic: 'equity_prices',
      type: 'update',
      unsubscribe: () => {
        this.off('equityPrice', handler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  // ============================================================================
  // Comments Subscriptions
  // ============================================================================

  /**
   * Subscribe to comment and reaction events
   */
  subscribeComments(
    filter: { parentEntityId: number; parentEntityType: 'Event' | 'Series' },
    handlers: {
      onComment?: (comment: Comment) => void;
      onReaction?: (reaction: Reaction) => void;
    } = {}
  ): Subscription {
    const subId = `comments_${++this.subscriptionIdCounter}`;
    const filterStr = JSON.stringify({
      parentEntityID: filter.parentEntityId,
      parentEntityType: filter.parentEntityType,
    });

    const subscriptions = [
      { topic: 'comments', type: 'comment_created', filters: filterStr },
      { topic: 'comments', type: 'comment_removed', filters: filterStr },
      { topic: 'comments', type: 'reaction_created', filters: filterStr },
      { topic: 'comments', type: 'reaction_removed', filters: filterStr },
    ];

    this.sendSubscription({ subscriptions });

    const commentHandler = (comment: Comment) => handlers.onComment?.(comment);
    const reactionHandler = (reaction: Reaction) => handlers.onReaction?.(reaction);

    this.on('comment', commentHandler);
    this.on('reaction', reactionHandler);

    const subscription: Subscription = {
      id: subId,
      topic: 'comments',
      type: '*',
      unsubscribe: () => {
        this.off('comment', commentHandler);
        this.off('reaction', reactionHandler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  // ============================================================================
  // RFQ Subscriptions
  // ============================================================================

  /**
   * Subscribe to RFQ (Request for Quote) events
   */
  subscribeRFQ(handlers: {
    onRequest?: (request: RFQRequest) => void;
    onQuote?: (quote: RFQQuote) => void;
  } = {}): Subscription {
    const subId = `rfq_${++this.subscriptionIdCounter}`;

    const subscriptions = [
      { topic: 'rfq', type: 'request_created' },
      { topic: 'rfq', type: 'request_edited' },
      { topic: 'rfq', type: 'request_canceled' },
      { topic: 'rfq', type: 'request_expired' },
      { topic: 'rfq', type: 'quote_created' },
      { topic: 'rfq', type: 'quote_edited' },
      { topic: 'rfq', type: 'quote_canceled' },
      { topic: 'rfq', type: 'quote_expired' },
    ];

    this.sendSubscription({ subscriptions });

    const requestHandler = (request: RFQRequest) => handlers.onRequest?.(request);
    const quoteHandler = (quote: RFQQuote) => handlers.onQuote?.(quote);

    this.on('rfqRequest', requestHandler);
    this.on('rfqQuote', quoteHandler);

    const subscription: Subscription = {
      id: subId,
      topic: 'rfq',
      type: '*',
      unsubscribe: () => {
        this.off('rfqRequest', requestHandler);
        this.off('rfqQuote', quoteHandler);
        this.sendUnsubscription({ subscriptions });
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);
    return subscription;
  }

  // ============================================================================
  // Cache Access
  // ============================================================================

  /**
   * Get cached derived price for an asset
   */
  getPrice(assetId: string): PriceUpdate | undefined {
    return this.priceCache.get(assetId);
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): Map<string, PriceUpdate> {
    return new Map(this.priceCache);
  }

  /**
   * Get cached orderbook for an asset
   */
  getBook(assetId: string): OrderbookSnapshot | undefined {
    return this.bookCache.get(assetId);
  }

  /**
   * Get cached last trade for an asset
   */
  getLastTrade(assetId: string): LastTradeInfo | undefined {
    return this.lastTradeCache.get(assetId);
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Unsubscribe from all
   */
  unsubscribeAll(): void {
    for (const sub of this.subscriptions.values()) {
      sub.unsubscribe();
    }
    this.subscriptions.clear();
    this.subscriptionMessages.clear();  // Clear reconnection list
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleConnect(client: RealTimeDataClient): void {
    this.connected = true;
    this.log('Connected to WebSocket server');

    // Re-subscribe to all active subscriptions on reconnect
    if (this.subscriptionMessages.size > 0) {
      this.log(`Re-subscribing to ${this.subscriptionMessages.size} subscriptions...`);
      for (const [subId, msg] of this.subscriptionMessages) {
        this.log(`Re-subscribing: ${subId}`);
        this.client?.subscribe(msg);
      }
    }

    this.emit('connected');
  }

  private handleStatusChange(status: ConnectionStatus): void {
    this.log(`Connection status: ${status}`);

    if (status === ConnectionStatus.DISCONNECTED) {
      this.connected = false;
      this.emit('disconnected');
    } else if (status === ConnectionStatus.CONNECTED) {
      this.connected = true;
    }

    this.emit('statusChange', status);
  }

  private handleMessage(client: RealTimeDataClient, message: Message): void {
    this.log(`Received: ${message.topic}:${message.type}`);

    const payload = message.payload as Record<string, unknown>;

    switch (message.topic) {
      case 'clob_market':
        this.handleMarketMessage(message.type, payload, message.timestamp);
        break;

      case 'clob_user':
        this.handleUserMessage(message.type, payload, message.timestamp);
        break;

      case 'activity':
        this.handleActivityMessage(message.type, payload, message.timestamp);
        break;

      case 'crypto_prices':
        this.handleCryptoPriceMessage(payload, message.timestamp);
        break;

      case 'crypto_prices_chainlink':
        this.handleCryptoChainlinkPriceMessage(payload, message.timestamp);
        break;

      case 'equity_prices':
        this.handleEquityPriceMessage(payload, message.timestamp);
        break;

      case 'comments':
        this.handleCommentMessage(message.type, payload, message.timestamp);
        break;

      case 'rfq':
        this.handleRFQMessage(message.type, payload, message.timestamp);
        break;

      default:
        this.log(`Unknown topic: ${message.topic}`);
    }
  }

  private handleMarketMessage(type: string, payload: Record<string, unknown>, timestamp: number): void {
    switch (type) {
      case 'agg_orderbook': {
        const book = this.parseOrderbook(payload, timestamp);
        this.bookCache.set(book.assetId, book);
        this.emit('orderbook', book);
        break;
      }

      case 'price_change': {
        const change = this.parsePriceChange(payload, timestamp);
        this.emit('priceChange', change);
        break;
      }

      case 'last_trade_price': {
        const trade = this.parseLastTrade(payload, timestamp);
        this.lastTradeCache.set(trade.assetId, trade);
        this.emit('lastTrade', trade);
        break;
      }

      case 'tick_size_change': {
        const change = this.parseTickSizeChange(payload, timestamp);
        this.emit('tickSizeChange', change);
        break;
      }

      case 'market_created':
      case 'market_resolved': {
        const event: MarketEvent = {
          conditionId: payload.condition_id as string || '',
          type: type === 'market_created' ? 'created' : 'resolved',
          data: payload,
          timestamp,
        };
        this.emit('marketEvent', event);
        break;
      }
    }
  }

  private handleUserMessage(type: string, payload: Record<string, unknown>, timestamp: number): void {
    if (type === 'order') {
      const order: UserOrder = {
        orderId: payload.order_id as string || '',
        market: payload.market as string || '',
        asset: payload.asset as string || '',
        side: payload.side as 'BUY' | 'SELL',
        price: Number(payload.price) || 0,
        originalSize: Number(payload.original_size) || 0,
        matchedSize: Number(payload.matched_size) || 0,
        eventType: payload.event_type as 'PLACEMENT' | 'UPDATE' | 'CANCELLATION',
        timestamp,
      };
      this.emit('userOrder', order);
    } else if (type === 'trade') {
      const trade: UserTrade = {
        tradeId: payload.trade_id as string || '',
        market: payload.market as string || '',
        outcome: payload.outcome as string || '',
        price: Number(payload.price) || 0,
        size: Number(payload.size) || 0,
        side: payload.side as 'BUY' | 'SELL',
        status: payload.status as 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED',
        timestamp,
        transactionHash: payload.transaction_hash as string | undefined,
      };
      this.emit('userTrade', trade);
    }
  }

  private handleActivityMessage(type: string, payload: Record<string, unknown>, timestamp: number): void {
    const trade: ActivityTrade = {
      asset: payload.asset as string || '',
      conditionId: payload.conditionId as string || '',
      eventSlug: payload.eventSlug as string || '',
      marketSlug: payload.slug as string || '',
      outcome: payload.outcome as string || '',
      price: Number(payload.price) || 0,
      side: payload.side as 'BUY' | 'SELL',
      size: Number(payload.size) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp) || timestamp,
      transactionHash: payload.transactionHash as string || '',
      trader: {
        name: payload.name as string | undefined,
        address: payload.proxyWallet as string | undefined,
      },
    };
    this.emit('activityTrade', trade);
  }

  private handleCryptoPriceMessage(payload: Record<string, unknown>, timestamp: number): void {
    const price: CryptoPrice = {
      symbol: payload.symbol as string || '',
      price: Number(payload.value) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp) || timestamp,
    };
    this.emit('cryptoPrice', price);
  }

  private handleCryptoChainlinkPriceMessage(payload: Record<string, unknown>, timestamp: number): void {
    const price: CryptoPrice = {
      symbol: payload.symbol as string || '',
      price: Number(payload.value) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp) || timestamp,
    };
    this.emit('cryptoChainlinkPrice', price);
  }

  private handleEquityPriceMessage(payload: Record<string, unknown>, timestamp: number): void {
    const price: EquityPrice = {
      symbol: payload.symbol as string || '',
      price: Number(payload.value) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp) || timestamp,
    };
    this.emit('equityPrice', price);
  }

  private handleCommentMessage(type: string, payload: Record<string, unknown>, timestamp: number): void {
    if (type.includes('comment')) {
      const comment: Comment = {
        id: payload.id as string || '',
        parentEntityId: payload.parentEntityID as number || 0,
        parentEntityType: payload.parentEntityType as 'Event' | 'Series',
        content: payload.content as string | undefined,
        author: payload.author as string | undefined,
        timestamp,
      };
      this.emit('comment', comment);
    } else if (type.includes('reaction')) {
      const reaction: Reaction = {
        id: payload.id as string || '',
        commentId: payload.commentId as string || '',
        type: payload.type as string || '',
        author: payload.author as string | undefined,
        timestamp,
      };
      this.emit('reaction', reaction);
    }
  }

  private handleRFQMessage(type: string, payload: Record<string, unknown>, timestamp: number): void {
    if (type.startsWith('request_')) {
      const status = type.replace('request_', '') as 'created' | 'edited' | 'canceled' | 'expired';
      const request: RFQRequest = {
        id: payload.id as string || '',
        market: payload.market as string || '',
        side: payload.side as 'BUY' | 'SELL',
        size: Number(payload.size) || 0,
        status,
        timestamp,
      };
      this.emit('rfqRequest', request);
    } else if (type.startsWith('quote_')) {
      const status = type.replace('quote_', '') as 'created' | 'edited' | 'canceled' | 'expired';
      const quote: RFQQuote = {
        id: payload.id as string || '',
        requestId: payload.request_id as string || '',
        price: Number(payload.price) || 0,
        size: Number(payload.size) || 0,
        status,
        timestamp,
      };
      this.emit('rfqQuote', quote);
    }
  }

  // Parsers

  private parseOrderbook(payload: Record<string, unknown>, timestamp: number): OrderbookSnapshot {
    const bidsRaw = payload.bids as Array<{ price: string; size: string }> || [];
    const asksRaw = payload.asks as Array<{ price: string; size: string }> || [];

    // Sort bids descending, asks ascending
    const bids = bidsRaw
      .map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
      .sort((a, b) => b.price - a.price);

    const asks = asksRaw
      .map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
      .sort((a, b) => a.price - b.price);

    const tokenId = payload.asset_id as string || '';
    return {
      tokenId,
      assetId: tokenId, // Backward compatibility
      market: payload.market as string || '',
      bids,
      asks,
      timestamp: this.normalizeTimestamp(payload.timestamp) || timestamp,
      tickSize: payload.tick_size as string || '0.01',
      minOrderSize: payload.min_order_size as string || '1',
      hash: payload.hash as string || '',
    };
  }

  private parsePriceChange(payload: Record<string, unknown>, timestamp: number): PriceChange {
    const changes = payload.price_changes as Array<{ price: string; size: string }> || [];
    return {
      assetId: payload.asset_id as string || '',
      changes,
      timestamp,
    };
  }

  private parseLastTrade(payload: Record<string, unknown>, timestamp: number): LastTradeInfo {
    return {
      assetId: payload.asset_id as string || '',
      price: parseFloat(payload.price as string) || 0,
      side: payload.side as 'BUY' | 'SELL' || 'BUY',
      size: parseFloat(payload.size as string) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp) || timestamp,
    };
  }

  private parseTickSizeChange(payload: Record<string, unknown>, timestamp: number): TickSizeChange {
    return {
      assetId: payload.asset_id as string || '',
      oldTickSize: payload.old_tick_size as string || '',
      newTickSize: payload.new_tick_size as string || '',
      timestamp,
    };
  }

  /**
   * Calculate derived price using Polymarket's display logic:
   * - If spread <= 0.10: use midpoint
   * - If spread > 0.10: use last trade price
   */
  private calculateDerivedPrice(assetId: string, book: OrderbookSnapshot): PriceUpdate | null {
    if (book.bids.length === 0 || book.asks.length === 0) {
      return null;
    }

    const bestBid = book.bids[0].price;
    const bestAsk = book.asks[0].price;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;

    const lastTrade = this.lastTradeCache.get(assetId);
    const lastTradePrice = lastTrade?.price ?? midpoint;

    // Polymarket display logic
    const displayPrice = spread <= 0.10 ? midpoint : lastTradePrice;

    return {
      assetId,
      price: displayPrice,
      midpoint,
      spread,
      timestamp: book.timestamp,
    };
  }

  private sendSubscription(msg: { subscriptions: Array<{ topic: string; type: string; filters?: string; clob_auth?: ClobApiKeyCreds }> }): void {
    if (this.client && this.connected) {
      this.client.subscribe(msg);
    } else {
      this.log('Cannot subscribe: not connected');
    }
  }

  private sendUnsubscription(msg: { subscriptions: Array<{ topic: string; type: string; filters?: string }> }): void {
    if (this.client && this.connected) {
      this.client.unsubscribe(msg);
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[RealtimeService] ${message}`);
    }
  }

  /**
   * Normalize timestamp to milliseconds
   * Polymarket WebSocket returns timestamps in seconds, need to convert to milliseconds
   */
  private normalizeTimestamp(ts: unknown): number {
    if (typeof ts === 'string') {
      const parsed = parseInt(ts, 10);
      if (isNaN(parsed)) return Date.now();
      // If timestamp is in seconds (< 1e12), convert to milliseconds
      return parsed < 1e12 ? parsed * 1000 : parsed;
    }
    if (typeof ts === 'number') {
      // If timestamp is in seconds (< 1e12), convert to milliseconds
      return ts < 1e12 ? ts * 1000 : ts;
    }
    return Date.now();
  }
}

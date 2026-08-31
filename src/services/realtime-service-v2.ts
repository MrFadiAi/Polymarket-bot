import { EventEmitter } from 'events';
import {
  RealTimeDataClient,
  type Message,
  type ClobApiKeyCreds,
  ConnectionStatus,
} from '@polymarket/real-time-data-client';

import type {
  PriceUpdate,
  BookUpdate,
  Orderbook,
} from '../core/types.js';

export interface RealtimeServiceConfig {
  autoReconnect?: boolean;
  pingInterval?: number;
  debug?: boolean;
  orderbookPollInterval?: number;
}

export interface OrderbookSnapshot extends Orderbook {
  tokenId: string;
  assetId: string;
  market: string;
  tickSize: string;
  minOrderSize: string;
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

export interface ActivityTrade {
  asset: string;
  conditionId: string;
  eventSlug: string;
  marketSlug: string;
  outcome: string;
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
  timestamp: number;
  transactionHash: string;
  trader?: {
    name?: string;
    address?: string;
  };
}

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

export interface Subscription {
  id: string;
  topic: string;
  type: string;
  unsubscribe: () => void;
}

export interface MarketSubscription extends Subscription {
  tokenIds: string[];
}

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

type SubscriptionMessage = {
  subscriptions: Array<{
    topic: string;
    type: string;
    filters?: string;
    clob_auth?: ClobApiKeyCreds;
  }>;
};

export class RealtimeServiceV2 extends EventEmitter {
  private client: RealTimeDataClient | null = null;
  private config: Required<RealtimeServiceConfig>;
  private subscriptions = new Map<string, Subscription>();
  private subscriptionMessages = new Map<string, SubscriptionMessage>();
  private subscriptionHandlers = new Map<string, () => void>();
  private subscriptionIdCounter = 0;
  private connected = false;
  private connecting = false;
  private pendingMessages: SubscriptionMessage[] = [];
  private priceCache = new Map<string, PriceUpdate>();
  private bookCache = new Map<string, OrderbookSnapshot>();
  private lastTradeCache = new Map<string, LastTradeInfo>();

  constructor(config: RealtimeServiceConfig = {}) {
    super();

    this.config = {
      autoReconnect: config.autoReconnect ?? true,
      pingInterval: config.pingInterval ?? 5000,
      debug: config.debug ?? false,
      orderbookPollInterval: config.orderbookPollInterval ?? 2000,
    };
  }

  // ============================================================
  // CONNECTION
  // ============================================================

  connect(): this {
    if (this.client || this.connecting) {
      this.log('Already connected/connecting');
      return this;
    }

    this.connecting = true;
    this.log('Connecting...');

    this.client = new RealTimeDataClient({
      onConnect: this.handleConnect.bind(this),
      onMessage: this.handleMessage.bind(this),
      onStatusChange: this.handleStatusChange.bind(this),
      autoReconnect: this.config.autoReconnect,
      pingInterval: this.config.pingInterval,
    });

    try {
      this.client.connect();
    } catch (error) {
      this.connecting = false;
      this.client = null;

      const err =
        error instanceof Error
          ? error
          : new Error(String(error));

      this.emit('error', err);
    }

    return this;
  }

  disconnect(): void {
    this.log('Disconnecting...');

    this.connecting = false;
    this.connected = false;

    if (this.client) {
      try {
        const anyClient = this.client as unknown as Record<string, unknown>;
        if (anyClient.ws && typeof anyClient.ws === 'object') {
          const ws = anyClient.ws as EventEmitter;
          ws.removeAllListeners?.('error');
          ws.on?.('error', () => {});
        }
        this.client.disconnect();
      } catch (error) {
        this.log(`Disconnect error: ${String(error)}`);
      }
    }

    this.client = null;

    for (const cleanup of this.subscriptionHandlers.values()) {
      cleanup();
    }

    this.subscriptionHandlers.clear();
    this.subscriptions.clear();
    this.subscriptionMessages.clear();
    this.pendingMessages = [];

    this.emit('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================
  // MARKET
  // ============================================================

  subscribeMarkets(
    tokenIds: string[],
    handlers: MarketDataHandlers = {},
  ): MarketSubscription {
    const cleanTokenIds = [
      ...new Set(
        tokenIds.filter(
          token => typeof token === 'string' && token.trim().length > 0,
        ),
      ),
    ];

    if (cleanTokenIds.length === 0) {
      throw new Error('subscribeMarkets: tokenIds is empty');
    }

    const subId = `market_${++this.subscriptionIdCounter}`;

    // Initialisation immédiate en cache pour éviter les race conditions de lecture
    cleanTokenIds.forEach(id => {
      if (!this.bookCache.has(id)) {
        const initialBook: OrderbookSnapshot = {
          tokenId: id,
          assetId: id,
          market: '',
          bids: [{ price: 0.49, size: 100 }],
          asks: [{ price: 0.51, size: 100 }],
          timestamp: Date.now(),
          tickSize: '0.01',
          minOrderSize: '1',
          hash: '',
        };
        this.bookCache.set(id, initialBook);
        const initialPrice = this.calculateDerivedPrice(id, initialBook);
        if (initialPrice) {
          this.priceCache.set(id, initialPrice);
        }
      }
    });

    const orderbookHandler = (book: OrderbookSnapshot) => {
      if (cleanTokenIds.includes(book.assetId)) {
        const derived = this.calculateDerivedPrice(book.assetId, book);
        if (derived) {
          this.priceCache.set(book.assetId, derived);
          this.emit('priceUpdate', derived);
        }
        handlers.onOrderbook?.(book);
      }
    };

    const priceChangeHandler = (change: PriceChange) => {
      if (cleanTokenIds.includes(change.assetId)) {
        handlers.onPriceChange?.(change);
      }
    };

    const lastTradeHandler = (trade: LastTradeInfo) => {
      if (cleanTokenIds.includes(trade.assetId)) {
        handlers.onLastTrade?.(trade);
      }
    };

    const tickHandler = (change: TickSizeChange) => {
      if (cleanTokenIds.includes(change.assetId)) {
        handlers.onTickSizeChange?.(change);
      }
    };

    this.on('orderbook', orderbookHandler);
    this.on('priceChange', priceChangeHandler);
    this.on('lastTrade', lastTradeHandler);
    this.on('tickSizeChange', tickHandler);

    let active = true;

    const fetchBooks = async () => {
      if (!active) return;

      await Promise.all(
        cleanTokenIds.map(async tokenId => {
          try {
            const res = await fetch(`https://clob.polymarket.com/book?token_id=${tokenId}`);
            if (!res.ok) return;

            const data = (await res.json()) as Record<string, unknown>;
            const book = this.parseOrderbook({ ...data, asset_id: tokenId }, Date.now());

            if (!book.assetId) return;

            this.bookCache.set(book.assetId, book);

            const derivedPrice = this.calculateDerivedPrice(book.assetId, book);
            if (derivedPrice) {
              this.priceCache.set(book.assetId, derivedPrice);
              this.emit('priceUpdate', derivedPrice);
            }

            this.emit('orderbook', book);
          } catch (err) {
            this.log(`CLOB book fetch error (${tokenId}): ${String(err)}`);
          }
        }),
      );
    };

    void fetchBooks();

    const interval = setInterval(() => {
      void fetchBooks();
    }, this.config.orderbookPollInterval);

    const cleanup = () => {
      active = false;
      clearInterval(interval);
      this.off('orderbook', orderbookHandler);
      this.off('priceChange', priceChangeHandler);
      this.off('lastTrade', lastTradeHandler);
      this.off('tickSizeChange', tickHandler);
    };

    this.subscriptionHandlers.set(subId, cleanup);

    const subscription: MarketSubscription = {
      id: subId,
      topic: 'clob_market',
      type: '*',
      tokenIds: cleanTokenIds,

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);

    return subscription;
  }

  subscribeMarket(
    yesTokenId: string,
    noTokenId: string,
    handlers: MarketDataHandlers & {
      onPriceUpdate?: (update: PriceUpdate) => void;
      onBookUpdate?: (update: BookUpdate) => void;
      onPairUpdate?: (update: {
        yes: PriceUpdate;
        no: PriceUpdate;
        spread: number;
      }) => void;
    } = {},
  ): MarketSubscription {
    let lastYesUpdate: PriceUpdate | undefined;
    let lastNoUpdate: PriceUpdate | undefined;

    const checkPairUpdate = () => {
      if (
        lastYesUpdate &&
        lastNoUpdate &&
        handlers.onPairUpdate
      ) {
        handlers.onPairUpdate({
          yes: lastYesUpdate,
          no: lastNoUpdate,
          spread: lastYesUpdate.price + lastNoUpdate.price,
        });
      }
    };

    return this.subscribeMarkets(
      [yesTokenId, noTokenId],
      {
        ...handlers,

        onOrderbook: book => {
          handlers.onOrderbook?.(book);

          handlers.onBookUpdate?.({
            assetId: book.assetId,
            bids: book.bids,
            asks: book.asks,
            timestamp: book.timestamp,
          });

          const price = this.calculateDerivedPrice(
            book.assetId,
            book,
          );

          if (!price) return;

          this.priceCache.set(book.assetId, price);

          if (book.assetId === yesTokenId) {
            lastYesUpdate = price;
          }

          if (book.assetId === noTokenId) {
            lastNoUpdate = price;
          }

          handlers.onPriceUpdate?.(price);
          this.emit('priceUpdate', price);

          checkPairUpdate();
        },

        onLastTrade: trade => {
          handlers.onLastTrade?.(trade);

          this.lastTradeCache.set(
            trade.assetId,
            trade,
          );

          const book = this.bookCache.get(
            trade.assetId,
          );

          if (!book) return;

          const price = this.calculateDerivedPrice(
            trade.assetId,
            book,
          );

          if (!price) return;

          this.priceCache.set(
            trade.assetId,
            price,
          );

          if (trade.assetId === yesTokenId) {
            lastYesUpdate = price;
          }

          if (trade.assetId === noTokenId) {
            lastNoUpdate = price;
          }

          handlers.onPriceUpdate?.(price);
          this.emit('priceUpdate', price);

          checkPairUpdate();
        },
      },
    );
  }

  subscribeMarketEvents(
    handlers: {
      onMarketEvent?: (event: MarketEvent) => void;
    } = {},
  ): Subscription {
    const subId = `market_event_${++this.subscriptionIdCounter}`;

    const handler = (event: MarketEvent) => {
      handlers.onMarketEvent?.(event);
    };

    this.on('marketEvent', handler);

    const cleanup = () => {
      this.off('marketEvent', handler);
    };

    this.subscriptionHandlers.set(subId, cleanup);

    const subscription: Subscription = {
      id: subId,
      topic: 'clob_market',
      type: 'lifecycle',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptions.delete(subId);
      },
    };

    this.subscriptions.set(subId, subscription);

    return subscription;
  }

  // ============================================================
  // USER
  // ============================================================

  subscribeUserEvents(
    credentials: ClobApiKeyCreds,
    handlers: UserDataHandlers = {},
  ): Subscription {
    const subId = `user_${++this.subscriptionIdCounter}`;

    const subscriptions = [
      {
        topic: 'clob_user',
        type: '*',
        clob_auth: credentials,
      },
    ];

    const message = { subscriptions };

    const orderHandler = (order: UserOrder) => {
      handlers.onOrder?.(order);
    };

    const tradeHandler = (trade: UserTrade) => {
      handlers.onTrade?.(trade);
    };

    this.on('userOrder', orderHandler);
    this.on('userTrade', tradeHandler);

    const cleanup = () => {
      this.off('userOrder', orderHandler);
      this.off('userTrade', tradeHandler);
    };

    this.subscriptionHandlers.set(subId, cleanup);
    this.subscriptionMessages.set(subId, message);

    const subscription: Subscription = {
      id: subId,
      topic: 'clob_user',
      type: '*',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptionMessages.delete(subId);
        this.subscriptions.delete(subId);
        this.sendUnsubscription(message);
      },
    };

    this.subscriptions.set(subId, subscription);
    this.sendSubscription(message);

    return subscription;
  }

  // ============================================================
  // ACTIVITY
  // ============================================================

  subscribeActivity(
    filter: {
      eventSlug?: string;
      marketSlug?: string;
    } = {},
    handlers: ActivityHandlers = {},
  ): Subscription {
    const subId = `activity_${++this.subscriptionIdCounter}`;

    const filterObj: Record<string, string> = {};

    if (filter.eventSlug) {
      filterObj.event_slug = filter.eventSlug;
    }

    if (filter.marketSlug) {
      filterObj.market_slug = filter.marketSlug;
    }

    const hasFilter = Object.keys(filterObj).length > 0;

    const subscriptions = hasFilter
      ? [
          {
            topic: 'activity',
            type: 'trades',
            filters: JSON.stringify(filterObj),
          },
          {
            topic: 'activity',
            type: 'orders_matched',
            filters: JSON.stringify(filterObj),
          },
        ]
      : [
          {
            topic: 'activity',
            type: 'trades',
          },
          {
            topic: 'activity',
            type: 'orders_matched',
          },
        ];

    const message = { subscriptions };

    const handler = (trade: ActivityTrade) => {
      handlers.onTrade?.(trade);
    };

    this.on('activityTrade', handler);

    const cleanup = () => {
      this.off('activityTrade', handler);
    };

    this.subscriptionHandlers.set(subId, cleanup);
    this.subscriptionMessages.set(subId, message);

    const subscription: Subscription = {
      id: subId,
      topic: 'activity',
      type: '*',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptionMessages.delete(subId);
        this.subscriptions.delete(subId);
        this.sendUnsubscription(message);
      },
    };

    this.subscriptions.set(subId, subscription);
    this.sendSubscription(message);

    return subscription;
  }

  subscribeAllActivity(
    handlers: ActivityHandlers = {},
  ): Subscription {
    return this.subscribeActivity({}, handlers);
  }

  // ============================================================
  // CRYPTO
  // ============================================================

  subscribeCryptoPrices(
    symbols: string[],
    handlers: CryptoPriceHandlers = {},
  ): Subscription {
    const subId = `crypto_${++this.subscriptionIdCounter}`;

    const cleanSymbols = [
      ...new Set(
        symbols
          .filter(
            symbol =>
              typeof symbol === 'string' &&
              symbol.trim().length > 0,
          )
          .map(symbol => symbol.trim().toLowerCase()),
      ),
    ];

    if (cleanSymbols.length === 0) {
      throw new Error('subscribeCryptoPrices: symbols is empty');
    }

    const subscriptions = cleanSymbols.map(symbol => ({
      topic: 'crypto_prices',
      type: 'update',
      filters: JSON.stringify({ symbol }),
    }));

    const messages: SubscriptionMessage[] = subscriptions.map(subscription => ({
      subscriptions: [subscription],
    }));

    const handler = (price: CryptoPrice) => {
      const symbol = price.symbol.trim().toLowerCase();

      if (!cleanSymbols.includes(symbol)) {
        return;
      }

      handlers.onPrice?.({
        ...price,
        symbol: symbol.toUpperCase(),
      });
    };

    this.on('cryptoPrice', handler);

    const cleanup = () => {
      this.off('cryptoPrice', handler);
    };

    this.subscriptionHandlers.set(subId, cleanup);
    this.subscriptionMessages.set(subId, { subscriptions });

    const subscription: Subscription = {
      id: subId,
      topic: 'crypto_prices',
      type: 'update',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptionMessages.delete(subId);
        this.subscriptions.delete(subId);

        for (const message of messages) {
          this.sendUnsubscription(message);
        }
      },
    };

    this.subscriptions.set(subId, subscription);

    for (const message of messages) {
      this.sendSubscription(message);
    }

    return subscription;
  }

  subscribeCryptoChainlinkPrices(
    symbols: string[],
    handlers: CryptoPriceHandlers = {},
  ): Subscription {
    const subId = `crypto_chainlink_${++this.subscriptionIdCounter}`;

    const cleanSymbols = [
      ...new Set(symbols.filter(Boolean)),
    ];

    const subscriptions = cleanSymbols.map(symbol => ({
      topic: 'crypto_prices_chainlink',
      type: 'update',
      filters: JSON.stringify({ symbol }),
    }));

    const message = { subscriptions };

    const handler = (price: CryptoPrice) => {
      if (cleanSymbols.some(symbol => symbol.toUpperCase() === price.symbol.toUpperCase())) {
        handlers.onPrice?.({ ...price, symbol: price.symbol.toUpperCase() });
      }
    };

    this.on('cryptoChainlinkPrice', handler);

    const cleanup = () => {
      this.off('cryptoChainlinkPrice', handler);
    };

    this.subscriptionHandlers.set(subId, cleanup);
    this.subscriptionMessages.set(subId, message);

    const subscription: Subscription = {
      id: subId,
      topic: 'crypto_prices_chainlink',
      type: 'update',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptionMessages.delete(subId);
        this.subscriptions.delete(subId);
        this.sendUnsubscription(message);
      },
    };

    this.subscriptions.set(subId, subscription);
    this.sendSubscription(message);

    return subscription;
  }

  // ============================================================
  // EQUITIES
  // ============================================================

  subscribeEquityPrices(
    symbols: string[],
    handlers: EquityPriceHandlers = {},
  ): Subscription {
    const subId = `equity_${++this.subscriptionIdCounter}`;

    const cleanSymbols = [
      ...new Set(symbols.filter(Boolean)),
    ];

    const subscriptions = cleanSymbols.map(symbol => ({
      topic: 'equity_prices',
      type: 'update',
      filters: JSON.stringify({ symbol }),
    }));

    const message = { subscriptions };

    const handler = (price: EquityPrice) => {
      if (cleanSymbols.some(symbol => symbol.toUpperCase() === price.symbol.toUpperCase())) {
        handlers.onPrice?.({ ...price, symbol: price.symbol.toUpperCase() });
      }
    };

    this.on('equityPrice', handler);

    const cleanup = () => {
      this.off('equityPrice', handler);
    };

    this.subscriptionHandlers.set(subId, cleanup);
    this.subscriptionMessages.set(subId, message);

    const subscription: Subscription = {
      id: subId,
      topic: 'equity_prices',
      type: 'update',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptionMessages.delete(subId);
        this.subscriptions.delete(subId);
        this.sendUnsubscription(message);
      },
    };

    this.subscriptions.set(subId, subscription);
    this.sendSubscription(message);

    return subscription;
  }

  // ============================================================
  // COMMENTS
  // ============================================================

  subscribeComments(
    filter: {
      parentEntityId: number;
      parentEntityType: 'Event' | 'Series';
    },
    handlers: {
      onComment?: (comment: Comment) => void;
      onReaction?: (reaction: Reaction) => void;
    } = {},
  ): Subscription {
    const subId = `comments_${++this.subscriptionIdCounter}`;

    const filters = JSON.stringify({
      parentEntityID: filter.parentEntityId,
      parentEntityType: filter.parentEntityType,
    });

    const subscriptions = [
      {
        topic: 'comments',
        type: 'comment_created',
        filters,
      },
      {
        topic: 'comments',
        type: 'comment_removed',
        filters,
      },
      {
        topic: 'comments',
        type: 'reaction_created',
        filters,
      },
      {
        topic: 'comments',
        type: 'reaction_removed',
        filters,
      },
    ];

    const message = { subscriptions };

    const commentHandler = (comment: Comment) => {
      handlers.onComment?.(comment);
    };

    const reactionHandler = (reaction: Reaction) => {
      handlers.onReaction?.(reaction);
    };

    this.on('comment', commentHandler);
    this.on('reaction', reactionHandler);

    const cleanup = () => {
      this.off('comment', commentHandler);
      this.off('reaction', reactionHandler);
    };

    this.subscriptionHandlers.set(subId, cleanup);
    this.subscriptionMessages.set(subId, message);

    const subscription: Subscription = {
      id: subId,
      topic: 'comments',
      type: '*',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptionMessages.delete(subId);
        this.subscriptions.delete(subId);
        this.sendUnsubscription(message);
      },
    };

    this.subscriptions.set(subId, subscription);
    this.sendSubscription(message);

    return subscription;
  }

  // ============================================================
  // RFQ
  // ============================================================

  subscribeRFQ(
    handlers: {
      onRequest?: (request: RFQRequest) => void;
      onQuote?: (quote: RFQQuote) => void;
    } = {},
  ): Subscription {
    const subId = `rfq_${++this.subscriptionIdCounter}`;

    const subscriptions = [
      'request_created',
      'request_edited',
      'request_canceled',
      'request_expired',
      'quote_created',
      'quote_edited',
      'quote_canceled',
      'quote_expired',
    ].map(type => ({
      topic: 'rfq',
      type,
    }));

    const message = { subscriptions };

    const requestHandler = (request: RFQRequest) => {
      handlers.onRequest?.(request);
    };

    const quoteHandler = (quote: RFQQuote) => {
      handlers.onQuote?.(quote);
    };

    this.on('rfqRequest', requestHandler);
    this.on('rfqQuote', quoteHandler);

    const cleanup = () => {
      this.off('rfqRequest', requestHandler);
      this.off('rfqQuote', quoteHandler);
    };

    this.subscriptionHandlers.set(subId, cleanup);
    this.subscriptionMessages.set(subId, message);

    const subscription: Subscription = {
      id: subId,
      topic: 'rfq',
      type: '*',

      unsubscribe: () => {
        cleanup();
        this.subscriptionHandlers.delete(subId);
        this.subscriptionMessages.delete(subId);
        this.subscriptions.delete(subId);
        this.sendUnsubscription(message);
      },
    };

    this.subscriptions.set(subId, subscription);
    this.sendSubscription(message);

    return subscription;
  }

  // ============================================================
  // CACHE
  // ============================================================

  getPrice(assetId: string): PriceUpdate | undefined {
    const cached = this.priceCache.get(assetId);
    if (cached) return cached;

    const book = this.bookCache.get(assetId);
    if (book) {
      const derived = this.calculateDerivedPrice(assetId, book);
      if (derived) {
        this.priceCache.set(assetId, derived);
        return derived;
      }
    }

    return undefined;
  }

  getAllPrices(): Map<string, PriceUpdate> {
    return new Map(this.priceCache);
  }

  getBook(assetId: string): OrderbookSnapshot | undefined {
    return this.bookCache.get(assetId);
  }

  getLastTrade(assetId: string): LastTradeInfo | undefined {
    return this.lastTradeCache.get(assetId);
  }

  getActiveSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  unsubscribeAll(): void {
    for (const sub of [...this.subscriptions.values()]) {
      sub.unsubscribe();
    }
  }

  // ============================================================
  // INTERNAL CONNECTION HANDLERS
  // ============================================================

  private handleConnect(_client: RealTimeDataClient): void {
    this.connected = true;
    this.connecting = false;

    this.log('CONNECTED');
    this.emit('connected');

    const pending = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const message of pending) {
      this.safeSubscribe(message);
    }

    for (const [subId, message] of this.subscriptionMessages) {
      this.log(`Re-subscribing ${subId}`);
      this.safeSubscribe(message);
    }
  }

  private handleStatusChange(status: ConnectionStatus): void {
    this.log(`STATUS: ${String(status)}`);

    if (status === ConnectionStatus.CONNECTED) {
      this.connected = true;
      this.connecting = false;
    }

    if (status === ConnectionStatus.DISCONNECTED) {
      this.connected = false;
      this.connecting = false;
      this.emit('disconnected');
    }

    this.emit('statusChange', status);
  }

  // ============================================================
  // MESSAGE ROUTER
  // ============================================================

  private handleMessage(_client: RealTimeDataClient, message: Message): void {
    this.log(`MESSAGE ${message.topic}:${message.type}`);

    const payload = (message.payload ?? {}) as Record<string, unknown>;

    try {
      switch (message.topic) {
        case 'clob_user':
          this.handleUserMessage(message.type, payload, message.timestamp);
          break;

        case 'activity':
          this.handleActivityMessage(message.type, payload, message.timestamp);
          break;

        case 'crypto_prices':
          if (message.type === 'update') {
            this.handleCryptoPriceMessage(payload, message.timestamp);
          }
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
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(String(error));

      this.log(`Message error: ${err.message}`);
      this.emit('error', err);
    }
  }

  private handleUserMessage(
    type: string,
    payload: Record<string, unknown>,
    timestamp: number,
  ): void {
    if (type === 'order') {
      this.emit('userOrder', {
        orderId: String(payload.order_id ?? ''),
        market: String(payload.market ?? ''),
        asset: String(payload.asset ?? ''),
        side: payload.side === 'SELL' ? 'SELL' : 'BUY',
        price: Number(payload.price) || 0,
        originalSize: Number(payload.original_size) || 0,
        matchedSize: Number(payload.matched_size) || 0,
        eventType: payload.event_type as UserOrder['eventType'],
        timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
      } satisfies UserOrder);
    }

    if (type === 'trade') {
      this.emit('userTrade', {
        tradeId: String(payload.trade_id ?? ''),
        market: String(payload.market ?? ''),
        outcome: String(payload.outcome ?? ''),
        price: Number(payload.price) || 0,
        size: Number(payload.size) || 0,
        side: payload.side === 'SELL' ? 'SELL' : 'BUY',
        status: payload.status as UserTrade['status'],
        timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
        transactionHash: payload.transaction_hash ? String(payload.transaction_hash) : undefined,
      } satisfies UserTrade);
    }
  }

  private handleActivityMessage(
    _type: string,
    payload: Record<string, unknown>,
    timestamp: number,
  ): void {
    const traderRaw = payload.trader as Record<string, unknown> | undefined;
    const traderAddress = payload.proxyWallet ?? traderRaw?.address;
    const traderName = payload.name ?? traderRaw?.name;

    const trade: ActivityTrade = {
      asset: String(payload.asset ?? ''),
      conditionId: String(payload.conditionId ?? payload.condition_id ?? ''),
      eventSlug: String(payload.eventSlug ?? payload.event_slug ?? ''),
      marketSlug: String(payload.slug ?? payload.marketSlug ?? payload.market_slug ?? ''),
      outcome: String(payload.outcome ?? ''),
      price: Number(payload.price) || 0,
      side: payload.side === 'SELL' ? 'SELL' : 'BUY',
      size: Number(payload.size) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
      transactionHash: String(payload.transactionHash ?? payload.transaction_hash ?? ''),
      trader: {
        name: traderName != null ? String(traderName) : undefined,
        address: traderAddress != null ? String(traderAddress) : undefined,
      },
    };

    this.emit('activityTrade', trade);
  }

  private handleCryptoPriceMessage(
    payload: Record<string, unknown>,
    timestamp: number,
  ): void {
    this.emit('cryptoPrice', {
      symbol: String(payload.symbol ?? ''),
      price: Number(payload.value ?? payload.price) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
    } satisfies CryptoPrice);
  }

  private handleCryptoChainlinkPriceMessage(
    payload: Record<string, unknown>,
    timestamp: number,
  ): void {
    this.emit('cryptoChainlinkPrice', {
      symbol: String(payload.symbol ?? ''),
      price: Number(payload.value ?? payload.price) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
    } satisfies CryptoPrice);
  }

  private handleEquityPriceMessage(
    payload: Record<string, unknown>,
    timestamp: number,
  ): void {
    this.emit('equityPrice', {
      symbol: String(payload.symbol ?? ''),
      price: Number(payload.value ?? payload.price) || 0,
      timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
    } satisfies EquityPrice);
  }

  private handleCommentMessage(
    type: string,
    payload: Record<string, unknown>,
    timestamp: number,
  ): void {
    if (type.includes('comment')) {
      this.emit('comment', {
        id: String(payload.id ?? ''),
        parentEntityId: Number(payload.parentEntityID ?? payload.parent_entity_id) || 0,
        parentEntityType: payload.parentEntityType === 'Series' ? 'Series' : 'Event',
        content: payload.content != null ? String(payload.content) : undefined,
        author: payload.author != null ? String(payload.author) : undefined,
        timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
      } satisfies Comment);
    }

    if (type.includes('reaction')) {
      this.emit('reaction', {
        id: String(payload.id ?? ''),
        commentId: String(payload.commentId ?? payload.comment_id ?? ''),
        type: String(payload.type ?? ''),
        author: payload.author != null ? String(payload.author) : undefined,
        timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
      } satisfies Reaction);
    }
  }

  private handleRFQMessage(
    type: string,
    payload: Record<string, unknown>,
    timestamp: number,
  ): void {
    if (type.startsWith('request_')) {
      this.emit('rfqRequest', {
        id: String(payload.id ?? ''),
        market: String(payload.market ?? ''),
        side: payload.side === 'SELL' ? 'SELL' : 'BUY',
        size: Number(payload.size) || 0,
        status: type.replace('request_', '') as RFQRequest['status'],
        timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
      } satisfies RFQRequest);
    }

    if (type.startsWith('quote_')) {
      this.emit('rfqQuote', {
        id: String(payload.id ?? ''),
        requestId: String(payload.request_id ?? payload.requestId ?? ''),
        price: Number(payload.price) || 0,
        size: Number(payload.size) || 0,
        status: type.replace('quote_', '') as RFQQuote['status'],
        timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
      } satisfies RFQQuote);
    }
  }

  // ============================================================
  // PARSERS
  // ============================================================

  private parseOrderbook(
    payload: Record<string, unknown>,
    timestamp: number,
  ): OrderbookSnapshot {
    const bidsRaw = Array.isArray(payload.bids) ? payload.bids : [];
    const asksRaw = Array.isArray(payload.asks) ? payload.asks : [];

    const bids = bidsRaw
      .map(level => {
        const l = level as Record<string, unknown>;
        return {
          price: Number(l.price) || 0,
          size: Number(l.size) || 0,
        };
      })
      .filter(level => Number.isFinite(level.price) && Number.isFinite(level.size) && level.price > 0 && level.size > 0)
      .sort((a, b) => b.price - a.price);

    const asks = asksRaw
      .map(level => {
        const l = level as Record<string, unknown>;
        return {
          price: Number(l.price) || 0,
          size: Number(l.size) || 0,
        };
      })
      .filter(level => Number.isFinite(level.price) && Number.isFinite(level.size) && level.price > 0 && level.size > 0)
      .sort((a, b) => a.price - b.price);

    const tokenId = String(payload.asset_id ?? payload.asset ?? payload.market ?? '').trim();

    return {
      tokenId,
      assetId: tokenId,
      market: String(payload.market ?? ''),
      bids,
      asks,
      timestamp: this.normalizeTimestamp(payload.timestamp, timestamp),
      tickSize: String(payload.tick_size ?? '0.01'),
      minOrderSize: String(payload.min_order_size ?? '1'),
      hash: String(payload.hash ?? ''),
    };
  }

  // ============================================================
  // PRICE
  // ============================================================

  private calculateDerivedPrice(
    assetId: string,
    book: OrderbookSnapshot,
  ): PriceUpdate | null {
    if (!book || (!book.bids.length && !book.asks.length)) {
      return null;
    }

    const bestBid = book.bids[0]?.price ?? (book.asks[0]?.price ? Math.max(0, book.asks[0].price - 0.01) : 0);
    const bestAsk = book.asks[0]?.price ?? (book.bids[0]?.price ? Math.min(1, book.bids[0].price + 0.01) : 1);
    const spread = Math.max(0, bestAsk - bestBid);
    const midpoint = (bestBid + bestAsk) / 2;

    const lastTrade = this.lastTradeCache.get(assetId);
    const lastTradePrice = lastTrade?.price ?? midpoint;
    const displayPrice = spread <= 0.10 ? midpoint : lastTradePrice;

    return {
      assetId,
      price: Number.isFinite(displayPrice) ? displayPrice : 0.5,
      midpoint: Number.isFinite(midpoint) ? midpoint : 0.5,
      spread: Number.isFinite(spread) ? spread : 0.01,
      timestamp: book.timestamp || Date.now(),
    };
  }

  // ============================================================
  // SUBSCRIBE / UNSUBSCRIBE
  // ============================================================

  private sendSubscription(message: SubscriptionMessage): void {
    if (!this.client || !this.connected) {
      this.log('Not connected -> queue subscription');
      this.pendingMessages.push(message);
      return;
    }

    this.safeSubscribe(message);
  }

  private safeSubscribe(message: SubscriptionMessage): void {
    if (!this.client) return;

    try {
      this.log(`SUBSCRIBE ${JSON.stringify(message)}`);
      this.client.subscribe(message);
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(String(error));

      this.log(`Subscribe error: ${err.message}`);
      this.emit('error', err);
    }
  }

  private sendUnsubscription(message: SubscriptionMessage): void {
    if (!this.client || !this.connected) return;

    try {
      this.client.unsubscribe({
        subscriptions: message.subscriptions.map(sub => ({
          topic: sub.topic,
          type: sub.type,
          filters: sub.filters,
        })),
      });
    } catch (error) {
      this.log(`Unsubscribe error: ${String(error)}`);
    }
  }

  // ============================================================
  // UTILS
  // ============================================================

  private normalizeTimestamp(value: unknown, fallback?: number): number {
    const ts =
      typeof value === 'string'
        ? Number(value)
        : typeof value === 'number'
          ? value
          : NaN;

    if (Number.isFinite(ts) && ts > 0) {
      return ts < 1e12 ? ts * 1000 : ts;
    }

    if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
      return fallback < 1e12 ? fallback * 1000 : fallback;
    }

    return Date.now();
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[RealtimeService] ${message}`);
    }
  }
}
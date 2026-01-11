# WebSocket 方案研究与选型

> 全面对比 Polymarket WebSocket 方案，确定最佳实现路径

---

## Migration Status: COMPLETED

**As of 2024-12, the WebSocket migration has been completed.**

| Task | Status |
|------|--------|
| Migrate to `@polymarket/real-time-data-client` | ✅ Completed |
| Create `RealtimeServiceV2` | ✅ Completed |
| Implement derived price calculation | ✅ Completed |
| Add user event support | ✅ Completed |
| Remove `@nevuamarkets/poly-websockets` | ✅ Completed |

**Final Implementation:**
- `RealtimeServiceV2` uses official `@polymarket/real-time-data-client`
- Derived price calculation implemented in-house (10 lines of code)
- User events (orders/trades) supported with authentication
- Old `WebSocketManager` and `RealtimeService` removed

---

## 1. 可用方案概览

| 方案 | 类型 | 来源 | 维护状态 |
|------|------|------|---------|
| `@polymarket/real-time-data-client` | 官方库 | Polymarket | ✅ 活跃 |
| CLOB WebSocket (ws library) | 官方协议 | Polymarket 文档 | ✅ 稳定 |
| `@nevuamarkets/poly-websockets` | 第三方库 | 社区 | ⚠️ 社区维护 |

---

## 2. 方案详细分析

### 2.1 @polymarket/real-time-data-client (官方)

**GitHub**: https://github.com/Polymarket/real-time-data-client
**版本**: 1.4.2
**Endpoint**: `wss://ws-live-data.polymarket.com`

#### 功能特性

| Topic | Type | 说明 |
|-------|------|------|
| `activity` | `trades`, `orders_matched` | 交易活动 |
| `clob_market` | `price_change` | 价格变动 (必须指定 token IDs) |
| `clob_market` | `agg_orderbook` | 聚合订单簿 |
| `clob_market` | `last_trade_price` | 最新成交价 |
| `clob_market` | `tick_size_change` | Tick size 变更 |
| `clob_market` | `market_created/resolved` | 市场状态 |
| `clob_user` | `order`, `trade` | 用户订单/成交 (需认证) |
| `crypto_prices` | `update` | 加密货币价格 (BTC, ETH 等) |
| `equity_prices` | `update` | 股票价格 |
| `comments` | `comment_created/removed` | 评论系统 |
| `rfq` | `request/quote_*` | RFQ 系统 |

#### 代码示例

```typescript
import { RealTimeDataClient } from "@polymarket/real-time-data-client";

const client = new RealTimeDataClient({
  onConnect: (client) => {
    // 订阅订单簿
    client.subscribe({
      subscriptions: [{
        topic: "clob_market",
        type: "agg_orderbook",
        filters: '["tokenId1", "tokenId2"]'
      }]
    });

    // 订阅价格变动
    client.subscribe({
      subscriptions: [{
        topic: "clob_market",
        type: "price_change",
        filters: '["tokenId1", "tokenId2"]'
      }]
    });
  },
  onMessage: (client, message) => {
    console.log(message.topic, message.type, message.payload);
  },
  autoReconnect: true,
  pingInterval: 5000
});

client.connect();
```

#### 优势

- ✅ **官方维护**: Polymarket 官方库，长期支持
- ✅ **功能全面**: 覆盖所有实时数据 (市场、用户、活动、评论、RFQ)
- ✅ **跨平台**: 支持 Browser 和 Node.js
- ✅ **内置重连**: 自动重连机制
- ✅ **Keepalive**: 内置 ping 保活

#### 劣势

- ⚠️ **单连接模式**: 无连接池
- ⚠️ **无派生价格**: 不计算 midpoint/spread
- ⚠️ **手动过滤**: 需自行处理 token ID 过滤

---

### 2.2 CLOB WebSocket (原生协议)

**Endpoint**: `wss://ws-subscriptions-clob.polymarket.com/ws/{type}`
**类型**: `market` (公开) / `user` (需认证)

#### 频道类型

**Market Channel** (公开):
```typescript
// 订阅消息
{
  type: "market",
  assets_ids: ["tokenId1", "tokenId2"],
  initial_dump: true  // 获取初始状态
}
```

事件类型:
- `Book` - 订单簿快照
- `PriceChange` - 价格变动
- `LastTradePrice` - 最新成交价
- `TickSizeChange` - Tick size 变更

**User Channel** (认证):
```typescript
// 订阅消息
{
  type: "user",
  markets: ["conditionId"],
  auth: {
    apiKey: "xxx",
    secret: "xxx",
    passphrase: "xxx"
  }
}
```

事件类型:
- `Order` - 订单更新 (PLACEMENT, UPDATE, CANCELLATION)
- `Trade` - 成交通知 (MATCHED, MINED, CONFIRMED, FAILED)

#### 代码示例

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'market',
    assets_ids: ['tokenId1', 'tokenId2'],
    initial_dump: true
  }));

  // Keepalive (50秒)
  setInterval(() => ws.send('PING'), 50000);
});

ws.on('message', (data) => {
  const event = JSON.parse(data.toString());
  console.log(event);
});
```

#### 优势

- ✅ **官方协议**: 直接使用 Polymarket WebSocket
- ✅ **最低延迟**: 无中间层
- ✅ **完全控制**: 自定义连接管理

#### 劣势

- ⚠️ **需手动实现**: 连接管理、重连、keepalive
- ⚠️ **无连接池**: 需自行管理多连接
- ⚠️ **无派生价格**: 需自行计算 midpoint/spread

---

### 2.3 @nevuamarkets/poly-websockets (当前使用)

**GitHub**: https://github.com/nevuamarkets/poly-websockets
**版本**: 0.3.0
**Endpoint**: `wss://ws-subscriptions-clob.polymarket.com/ws/market`

#### 功能特性

```typescript
import { WSSubscriptionManager } from '@nevuamarkets/poly-websockets';

const manager = new WSSubscriptionManager({
  onBook: (book) => { /* 订单簿快照 */ },
  onLastTradePrice: (trade) => { /* 最新成交 */ },
  onPriceChange: (change) => { /* 价格变动 */ },
  onTickSizeChange: (tick) => { /* Tick size 变更 */ },
  onPolymarketPriceUpdate: (price) => { /* 派生价格 (重要!) */ },
  onWSOpen: () => { /* 连接建立 */ },
  onWSClose: () => { /* 连接关闭 */ },
  onError: (err) => { /* 错误处理 */ }
}, {
  maxMarketsPerWS: 100,  // 每连接最大资产数
  reconnectAndCleanupIntervalMs: 10000
});

await manager.addSubscriptions(['tokenId1', 'tokenId2']);
```

#### 关键特性: 派生价格 (PolymarketPriceUpdate)

实现了 Polymarket 的显示价格逻辑:

```typescript
// Polymarket 官方价格显示逻辑
if (spread <= 0.10) {
  displayPrice = midpoint;  // 使用中间价
} else {
  displayPrice = lastTradePrice;  // 使用最新成交价
}
```

这个 `onPolymarketPriceUpdate` 事件直接提供计算好的显示价格。

#### 优势

- ✅ **连接池**: 自动分组管理 (100 资产/连接)
- ✅ **派生价格**: 实现 Polymarket 显示逻辑
- ✅ **内置重连**: 自动重连机制
- ✅ **速率限制**: 内置 Bottleneck 限流 (5 req/s)
- ✅ **TypeScript**: 完整类型支持

#### 劣势

- ⚠️ **社区维护**: 非官方库，更新可能不及时
- ⚠️ **仅 Market 频道**: 不支持 User 频道
- ⚠️ **无活动数据**: 不支持 trades/activity 订阅
- ⚠️ **AGPL 许可**: 可能有许可证问题

---

## 3. 功能对比矩阵

| 功能 | real-time-data-client | CLOB WebSocket | poly-websockets |
|------|----------------------|----------------|-----------------|
| **订单簿** | ✅ agg_orderbook | ✅ Book | ✅ onBook |
| **价格变动** | ✅ price_change | ✅ PriceChange | ✅ onPriceChange |
| **最新成交** | ✅ last_trade_price | ✅ LastTradePrice | ✅ onLastTradePrice |
| **Tick Size** | ✅ tick_size_change | ✅ TickSizeChange | ✅ onTickSizeChange |
| **派生价格** | ❌ | ❌ | ✅ onPolymarketPriceUpdate |
| **用户订单** | ✅ clob_user | ✅ User Channel | ❌ |
| **交易活动** | ✅ activity | ❌ | ❌ |
| **加密货币价格** | ✅ crypto_prices | ❌ | ❌ |
| **评论系统** | ✅ comments | ❌ | ❌ |
| **RFQ** | ✅ rfq | ❌ | ❌ |
| **连接池** | ❌ | ❌ | ✅ (100/conn) |
| **自动重连** | ✅ | ❌ 手动 | ✅ |
| **速率限制** | ❌ | ❌ | ✅ Bottleneck |
| **官方支持** | ✅ | ✅ | ❌ 社区 |

---

## 4. 推荐方案

### 4.1 混合架构 (推荐)

```
┌────────────────────────────────────────────────────────────┐
│                     RealtimeService                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────┐    │
│  │  MarketDataManager  │    │   UserEventManager      │    │
│  │  (市场数据)         │    │   (用户事件)            │    │
│  └──────────┬──────────┘    └───────────┬─────────────┘    │
│             │                           │                   │
│             ▼                           ▼                   │
│  ┌─────────────────────┐    ┌─────────────────────────┐    │
│  │ @polymarket/        │    │ @polymarket/            │    │
│  │ real-time-data-     │    │ real-time-data-         │    │
│  │ client              │    │ client                  │    │
│  │ (clob_market topic) │    │ (clob_user topic)       │    │
│  └─────────────────────┘    └─────────────────────────┘    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### 4.2 实现策略

**Phase 1: 迁移到官方 real-time-data-client**

```typescript
// 新的 MarketDataManager
class MarketDataManager {
  private client: RealTimeDataClient;
  private priceCache: Map<string, PriceUpdate>;
  private bookCache: Map<string, BookUpdate>;

  constructor() {
    this.client = new RealTimeDataClient({
      onConnect: this.handleConnect.bind(this),
      onMessage: this.handleMessage.bind(this),
      autoReconnect: true,
      pingInterval: 5000
    });
  }

  async subscribeMarkets(tokenIds: string[]) {
    this.client.subscribe({
      subscriptions: [
        { topic: 'clob_market', type: 'agg_orderbook', filters: JSON.stringify(tokenIds) },
        { topic: 'clob_market', type: 'price_change', filters: JSON.stringify(tokenIds) },
        { topic: 'clob_market', type: 'last_trade_price', filters: JSON.stringify(tokenIds) }
      ]
    });
  }

  // 自行实现派生价格逻辑
  private calculateDisplayPrice(tokenId: string): number {
    const book = this.bookCache.get(tokenId);
    const lastTrade = this.lastTradeCache.get(tokenId);

    if (!book || book.bids.length === 0 || book.asks.length === 0) {
      return lastTrade?.price ?? 0;
    }

    const bestBid = book.bids[0].price;
    const bestAsk = book.asks[0].price;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;

    // Polymarket 显示逻辑
    if (spread <= 0.10) {
      return midpoint;
    } else {
      return lastTrade?.price ?? midpoint;
    }
  }
}
```

**Phase 2: 添加用户事件支持**

```typescript
// 新的 UserEventManager
class UserEventManager {
  private client: RealTimeDataClient;

  async subscribeUserEvents(credentials: ClobApiKeyCreds) {
    this.client.subscribe({
      subscriptions: [{
        topic: 'clob_user',
        type: '*',  // 订阅所有用户事件
        clob_auth: credentials
      }]
    });
  }
}
```

### 4.3 迁移路径

| 阶段 | 任务 | 影响 |
|------|------|------|
| **Phase 1** | 创建 `MarketDataManager` 封装官方 client | 无 breaking change |
| **Phase 2** | 实现派生价格逻辑 | 无 breaking change |
| **Phase 3** | 迁移 `RealtimeService` 到新实现 | 内部重构 |
| **Phase 4** | 添加 `UserEventManager` | 新功能 |
| **Phase 5** | 移除 `@nevuamarkets/poly-websockets` 依赖 | 清理 |

---

## 5. 关键决策

### 5.1 为什么选择官方 real-time-data-client?

1. **官方维护**: 长期支持，与 Polymarket API 同步更新
2. **功能完整**: 支持所有数据类型 (市场、用户、活动等)
3. **统一接口**: 单一库覆盖所有 WebSocket 需求
4. **认证支持**: 内置 CLOB/Gamma 认证

### 5.2 为什么移除 poly-websockets?

1. **社区库风险**: 非官方维护，可能更新滞后
2. **功能有限**: 仅支持 Market 频道
3. **许可证问题**: AGPL 可能有商业限制
4. **功能可替代**: 派生价格逻辑可自行实现 (约 10 行代码)

### 5.3 派生价格实现

poly-websockets 的核心价值是派生价格，但这只需简单逻辑:

```typescript
function calculateDisplayPrice(
  bestBid: number,
  bestAsk: number,
  lastTradePrice: number
): number {
  const spread = bestAsk - bestBid;
  const midpoint = (bestBid + bestAsk) / 2;

  // Polymarket 官方显示逻辑
  return spread <= 0.10 ? midpoint : lastTradePrice;
}
```

---

## 6. 新架构设计

```typescript
// src/services/realtime-service.ts

import { RealTimeDataClient, Message } from '@polymarket/real-time-data-client';

export class RealtimeService extends EventEmitter {
  private client: RealTimeDataClient;
  private subscriptions: Map<string, Set<string>> = new Map();
  private priceCache: Map<string, PriceUpdate> = new Map();
  private bookCache: Map<string, BookUpdate> = new Map();
  private lastTradeCache: Map<string, TradeInfo> = new Map();

  constructor(private config?: RealtimeConfig) {
    super();
    this.client = new RealTimeDataClient({
      onConnect: this.handleConnect.bind(this),
      onMessage: this.handleMessage.bind(this),
      onStatusChange: this.handleStatusChange.bind(this),
      autoReconnect: config?.autoReconnect ?? true,
      pingInterval: config?.pingInterval ?? 5000
    });
  }

  connect(): void {
    this.client.connect();
  }

  disconnect(): void {
    this.client.disconnect();
  }

  // 订阅市场数据
  subscribeMarket(tokenIds: string[]): void {
    this.client.subscribe({
      subscriptions: [
        { topic: 'clob_market', type: 'agg_orderbook', filters: JSON.stringify(tokenIds) },
        { topic: 'clob_market', type: 'price_change', filters: JSON.stringify(tokenIds) },
        { topic: 'clob_market', type: 'last_trade_price', filters: JSON.stringify(tokenIds) }
      ]
    });
  }

  // 订阅用户事件 (需认证)
  subscribeUser(credentials: ClobApiKeyCreds): void {
    this.client.subscribe({
      subscriptions: [{
        topic: 'clob_user',
        type: '*',
        clob_auth: credentials
      }]
    });
  }

  // 获取缓存价格
  getPrice(tokenId: string): PriceUpdate | undefined {
    return this.priceCache.get(tokenId);
  }

  // 获取缓存订单簿
  getBook(tokenId: string): BookUpdate | undefined {
    return this.bookCache.get(tokenId);
  }

  private handleMessage(client: RealTimeDataClient, message: Message): void {
    switch (message.topic) {
      case 'clob_market':
        this.handleMarketMessage(message);
        break;
      case 'clob_user':
        this.handleUserMessage(message);
        break;
    }
  }

  private handleMarketMessage(message: Message): void {
    const payload = message.payload as any;

    switch (message.type) {
      case 'agg_orderbook':
        const book = this.parseOrderbook(payload);
        this.bookCache.set(book.assetId, book);
        this.emit('bookUpdate', book);
        this.emitDerivedPrice(book.assetId);
        break;

      case 'last_trade_price':
        const trade = this.parseTrade(payload);
        this.lastTradeCache.set(trade.assetId, trade);
        this.emit('lastTrade', trade);
        this.emitDerivedPrice(trade.assetId);
        break;

      case 'price_change':
        // 处理价格变动
        break;
    }
  }

  // 派生价格计算 (替代 poly-websockets 的 PolymarketPriceUpdate)
  private emitDerivedPrice(tokenId: string): void {
    const book = this.bookCache.get(tokenId);
    const lastTrade = this.lastTradeCache.get(tokenId);

    if (!book) return;

    const bestBid = book.bids[0]?.price ?? 0;
    const bestAsk = book.asks[0]?.price ?? 1;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;

    // Polymarket 显示逻辑
    const displayPrice = spread <= 0.10
      ? midpoint
      : (lastTrade?.price ?? midpoint);

    const priceUpdate: PriceUpdate = {
      assetId: tokenId,
      price: displayPrice,
      midpoint,
      spread,
      bestBid,
      bestAsk,
      timestamp: Date.now()
    };

    this.priceCache.set(tokenId, priceUpdate);
    this.emit('priceUpdate', priceUpdate);
  }
}
```

---

## 7. 总结

### 最终实现方案 (已完成)

| 组件 | 选择 | 状态 |
|------|------|------|
| **WebSocket Client** | `@polymarket/real-time-data-client` | ✅ Implemented |
| **Service Layer** | `RealtimeServiceV2` | ✅ Created |
| **派生价格** | 自行实现 | ✅ Implemented |
| **连接管理** | 自行封装 | ✅ Implemented |

### 依赖变更 (已完成)

```json
// package.json - 已移除
{
  "dependencies": {
    "@nevuamarkets/poly-websockets": "^0.3.0"  // ✅ 已删除
  }
}
```

```json
// package.json - 已新增
{
  "dependencies": {
    "@polymarket/real-time-data-client": "^1.4.2"  // ✅ 已添加
  }
}
```

### 实施状态 (全部完成)

1. ✅ 完成 SDK 架构重构 (01-overview.md)
2. ✅ WebSocket 方案确定 (本文档)
3. ✅ 创建 `RealtimeServiceV2` 使用官方 client
4. ✅ 迁移现有订阅到新实现
5. ✅ 移除 `@nevuamarkets/poly-websockets` 依赖

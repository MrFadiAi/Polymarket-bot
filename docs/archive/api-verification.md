# Polymarket API 完整验证报告

> 原则：Don't trust, verify
> 更新时间：2025-12-26
> 数据来源：**官方文档** + 实际 API 调用验证

---

## 概述

本文档基于 [Polymarket 官方文档](https://docs.polymarket.com/) 完整阅读后整理，结合实际 API 调用验证。

**之前版本的问题**：
- 只运行了验证脚本，没有认真阅读官方文档
- 遗漏了大量 API 参数
- 没有覆盖 Subgraph（共 5 个子图）
- 没有记录认证级别

---

## 1. API 架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Polymarket API 完整架构                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │   Gamma API         │  市场发现层                                         │
│  │   gamma-api.        │  - 市场/事件搜索与浏览                              │
│  │   polymarket.com    │  - 丰富元数据 (70+ 字段)                            │
│  └─────────────────────┘  - 标签/系列/评论/用户资料                          │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │   CLOB API          │  交易执行层                                         │
│  │   clob.             │  - REST: 订单簿/价格/订单管理                       │
│  │   polymarket.com    │  - WebSocket: 实时市场/用户数据                     │
│  └─────────────────────┘  - 4 种认证级别: Public/L1/L2/Builder              │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │   Data API          │  用户数据层                                         │
│  │   data-api.         │  - Core: 持仓/交易/活动/排行榜                      │
│  │   polymarket.com    │  - Misc: 市场数/持仓量/成交量                       │
│  └─────────────────────┘  - Builders: 构建者排行榜                           │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │   Subgraph (5个)    │  链上数据层                                         │
│  │   Goldsky hosted    │  - Orders / Positions / Activity                   │
│  │   GraphQL           │  - Open Interest / PNL                             │
│  └─────────────────────┘  - 历史数据 / 链上验证                              │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │   WebSocket         │  实时数据层                                         │
│  │   ws-subscriptions  │  - User Channel: 订单/持仓更新                      │
│  │   -clob.polymarket  │  - Market Channel: 价格/订单簿更新                  │
│  └─────────────────────┘                                                    │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │   RTDS              │  实时数据流                                         │
│  │   ws-live-data.     │  - Crypto Prices                                   │
│  │   polymarket.com    │  - Comments                                        │
│  └─────────────────────┘                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Gamma API 完整端点

### 2.1 基本信息

- **Base URL**: `https://gamma-api.polymarket.com`
- **命名风格**: camelCase
- **响应格式**: 直接返回数组（无包装）

### 2.2 端点列表

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/markets` | GET | 获取市场列表 |
| `/markets/slug/{slug}` | GET | 按 slug 获取市场 |
| `/events` | GET | 获取事件列表 |
| `/events/slug/{slug}` | GET | 按 slug 获取事件 |
| `/tags` | GET | 获取标签 |
| `/sports` | GET | 获取体育元数据 |
| `/series` | GET | 获取系列 |
| `/comments` | GET | 获取评论 |
| `/profiles` | GET | 获取用户资料 |
| `/search` | GET | 搜索 |

### 2.3 Markets/Events 查询参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `tag_id` | integer | - | 按标签过滤 |
| `closed` | boolean | - | 过滤已结束市场 |
| `active` | boolean | - | 过滤活跃市场 |
| `order` | string | - | 排序字段 (如 `id`) |
| `ascending` | boolean | false | 排序方向 |
| `limit` | integer | - | 返回数量限制 |
| `offset` | integer | 0 | 分页偏移 |
| `related_tags` | boolean | false | 包含相关标签 |
| `exclude_tag_id` | integer | - | 排除特定标签 |
| `slug` | string | - | 精确匹配 slug |

### 2.4 Market 对象结构

```typescript
interface GammaMarket {
  // === 标识 ===
  id: string;
  conditionId: string;          // 0x... 64 hex
  slug: string;
  questionID: string;           // neg-risk 市场标识

  // === 内容 ===
  question: string;
  description: string;
  resolutionSource: string;

  // === 图片 ===
  image: string;
  icon: string;

  // === 结果 (注意: JSON 字符串!) ===
  outcomes: string;             // '["Yes", "No"]' - 需要 JSON.parse
  outcomePrices: string;        // '["0.65", "0.35"]' - 需要 JSON.parse
  clobTokenIds: string;         // JSON 字符串 - 需要 JSON.parse

  // === 价格指标 ===
  lastTradePrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  oneHourPriceChange: number;
  oneDayPriceChange: number;
  oneWeekPriceChange: number;
  oneMonthPriceChange: number;

  // === 成交量 (注意: volume 是 string!) ===
  volume: string;               // string 类型!
  volumeNum: number;            // number 类型
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  volume1yr: number;
  volumeClob: number;
  volumeAmm: number;

  // === 交易参数 ===
  orderMinSize: number;
  orderPriceMinTickSize: number;
  fee: string;                  // wei 格式
  makerBaseFee: number;
  takerBaseFee: number;

  // === 状态 ===
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  enableOrderBook: boolean;

  // === 时间 ===
  startDate: string;            // ISO 8601
  endDate: string;
  createdAt: string;
  updatedAt: string;
  closedTime: string;

  // === UMA 结算 ===
  umaEndDate: string;
  umaResolutionStatus: string;
  umaBond: string;
  umaReward: string;
  resolvedBy: string;

  // === Neg-Risk ===
  negRisk: boolean;
  negRiskMarketID: string;
  negRiskRequestID: string;

  // === 奖励 ===
  clobRewards: ClobReward[];
  rewardsMinSize: number;
  rewardsMaxSpread: number;

  // === 事件关联 ===
  events: GammaEvent[];

  // === 其他 ===
  marketType: string;
  groupItemTitle: string;
  restricted: boolean;
}
```

---

## 3. CLOB API 完整端点

### 3.1 基本信息

- **Base URL**: `https://clob.polymarket.com`
- **WebSocket**: `wss://ws-subscriptions-clob.polymarket.com/ws/`
- **命名风格**: snake_case
- **响应格式**: 外层有 `{ data: [...] }` 包装

### 3.2 认证级别

| 级别 | 要求 | 用途 |
|------|------|------|
| **Public** | 无 | 读取市场数据、价格 |
| **L1** | 钱包签名 | 初始设置 |
| **L2** | API 凭证 | 交易、持仓管理 |
| **Builder** | Builder 凭证 | 订单归因 |

### 3.3 REST 端点

#### Orderbook

| 端点 | 方法 | 参数 | 描述 |
|------|------|------|------|
| `/book` | GET | `token_id` (必需) | 获取订单簿 |
| `/books` | POST | body: token_ids | 批量获取订单簿 |

**响应结构**:
```typescript
interface OrderBook {
  market: string;           // condition_id
  asset_id: string;         // token_id
  timestamp: string;        // 纳秒时间戳!
  hash: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  min_order_size: string;
  tick_size: string;
  neg_risk: boolean;
}

interface OrderBookLevel {
  price: string;
  size: string;
}
```

#### Pricing

| 端点 | 方法 | 参数 | 描述 |
|------|------|------|------|
| `/price` | GET | `token_id`, `side` | 获取单个价格 |
| `/prices` | GET | `token_ids` | 获取多个价格 |
| `/prices` | POST | body | 批量获取价格 |
| `/midpoint` | GET | `token_id` | 获取中间价 |
| `/prices-history` | GET | `token_id`, `interval` | 历史价格 |

#### Spreads

| 端点 | 方法 | 参数 | 描述 |
|------|------|------|------|
| `/spreads` | POST | body: token_ids | 获取多个 spread |

#### Markets

| 端点 | 方法 | 参数 | 描述 |
|------|------|------|------|
| `/markets` | GET | - | 获取市场列表 |
| `/markets/{condition_id}` | GET | - | 获取单个市场 |

### 3.4 CLOB Market 结构

```typescript
interface ClobMarket {
  condition_id: string;
  question_id: string;
  market_slug: string;
  question: string;
  description: string;
  icon: string;
  image: string;

  // === 交易参数 ===
  minimum_order_size: number;
  minimum_tick_size: number;
  seconds_delay: number;
  maker_base_fee: number;
  taker_base_fee: number;

  // === 状态 ===
  enable_order_book: boolean;
  active: boolean;
  closed: boolean;
  archived: boolean;
  accepting_orders: boolean;

  // === Tokens (核心!) ===
  tokens: ClobToken[];

  // === Neg-Risk ===
  neg_risk: boolean;
  neg_risk_market_id: string;

  // === 其他 ===
  fpmm: string;               // AMM 合约地址
  game_start_time: string | null;
  rewards: ClobRewards;
  tags: string[];
}

interface ClobToken {
  token_id: string;
  outcome: string;            // "Yes" | "No"
  price: number;              // 当前价格
  winner: boolean;            // 是否获胜
}
```

---

## 4. Data API 完整端点

### 4.1 基本信息

- **Base URL**: `https://data-api.polymarket.com`
- **命名风格**: camelCase
- **时间戳**: Unix 秒（不是毫秒！）

### 4.2 Core 端点

#### Positions

**URL**: `GET /positions`

| 参数 | 类型 | 默认值 | 范围 | 描述 |
|------|------|--------|------|------|
| `user` | string | **必需** | - | 用户地址 (0x...) |
| `market` | string[] | - | - | conditionId 数组 |
| `eventId` | integer[] | - | ≥1 | 事件 ID 数组 |
| `title` | string | - | max 100 | 按标题过滤 |
| `sizeThreshold` | number | 1 | ≥0 | 最小持仓大小 |
| `redeemable` | boolean | false | - | 可赎回过滤 |
| `mergeable` | boolean | false | - | 可合并过滤 |
| `limit` | integer | 100 | 0-500 | 返回数量 |
| `offset` | integer | 0 | 0-10000 | 分页偏移 |
| `sortBy` | enum | TOKENS | CURRENT, INITIAL, TOKENS, CASHPNL, PERCENTPNL, TITLE, RESOLVING, PRICE, AVGPRICE | 排序字段 |
| `sortDirection` | enum | DESC | ASC, DESC | 排序方向 |

**响应结构**:
```typescript
interface Position {
  proxyWallet: string;
  asset: string;              // token_id
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}
```

#### Trades

**URL**: `GET /trades`

| 参数 | 类型 | 默认值 | 范围 | 描述 |
|------|------|--------|------|------|
| `limit` | integer | 100 | 0-10000 | 返回数量 |
| `offset` | integer | 0 | 0-10000 | 分页偏移 |
| `market` | string[] | - | - | conditionId 数组 |
| `eventId` | integer[] | - | - | 事件 ID 数组 |
| `user` | string | - | - | 用户地址 |
| `side` | enum | - | BUY, SELL | 交易方向 |
| `takerOnly` | boolean | true | - | 仅 taker |
| `filterType` | enum | - | CASH, TOKENS | 过滤类型 |
| `filterAmount` | number | - | ≥0 | 过滤金额 |

**响应结构**:
```typescript
interface Trade {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;              // 注意: 这是 token_id!
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;          // Unix 秒!
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  name: string;
  pseudonym: string;
  bio: string;
  profileImage: string;
  transactionHash: string;
}
```

#### Activity

**URL**: `GET /activity`

| 参数 | 类型 | 默认值 | 范围 | 描述 |
|------|------|--------|------|------|
| `user` | string | **必需** | - | 用户地址 |
| `limit` | integer | 100 | 0-500 | 返回数量 |
| `offset` | integer | 0 | 0-10000 | 分页偏移 |
| `market` | string[] | - | - | conditionId 数组 |
| `eventId` | integer[] | - | - | 事件 ID 数组 |
| `type` | enum[] | - | TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION | 活动类型 |
| `start` | integer | - | ≥0 | 开始时间 (Unix 秒) |
| `end` | integer | - | ≥0 | 结束时间 (Unix 秒) |
| `sortBy` | enum | TIMESTAMP | TIMESTAMP, TOKENS, CASH | 排序字段 |
| `sortDirection` | enum | DESC | ASC, DESC | 排序方向 |
| `side` | enum | - | BUY, SELL | 交易方向 |

**响应结构**:
```typescript
interface Activity {
  proxyWallet: string;
  timestamp: number;          // Unix 秒!
  conditionId: string;
  type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD' | 'CONVERSION';
  size: number;
  usdcSize: number;
  price: number;
  side: 'BUY' | 'SELL';
  outcomeIndex: number;
  transactionHash: string;
  asset: string;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  name: string;
  pseudonym: string;
  bio: string;
  profileImage: string;
}
```

#### Leaderboard

**URL**: `GET /v1/leaderboard` (注意 v1 前缀!)

| 参数 | 类型 | 默认值 | 范围 | 描述 |
|------|------|--------|------|------|
| `category` | enum | OVERALL | OVERALL, POLITICS, SPORTS, CRYPTO, CULTURE, MENTIONS, WEATHER, ECONOMICS, TECH, FINANCE | 类别 |
| `timePeriod` | enum | DAY | DAY, WEEK, MONTH, ALL | 时间范围 |
| `orderBy` | enum | PNL | PNL, VOL | 排序依据 |
| `limit` | integer | 25 | 1-50 | 返回数量 |
| `offset` | integer | 0 | 0-1000 | 分页偏移 |
| `user` | string | - | - | 按用户地址过滤 |
| `userName` | string | - | - | 按用户名过滤 |

**响应结构**:
```typescript
interface LeaderboardEntry {
  rank: string;               // 注意: string 类型!
  proxyWallet: string;
  userName: string;
  vol: number;
  pnl: number;
  profileImage: string;
  xUsername: string;
  verifiedBadge: boolean;
}
```

#### Holders

**URL**: `GET /holders`

| 参数 | 类型 | 默认值 | 范围 | 描述 |
|------|------|--------|------|------|
| `market` | string[] | **必需** | - | conditionId 数组 |
| `limit` | integer | 20 | 0-20 | 每个 token 的持有者数量 |
| `minBalance` | integer | 1 | 0-999999 | 最小持仓量 |

#### Value

**URL**: `GET /value`

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `user` | string | **必需** | 用户地址 |
| `market` | string[] | - | conditionId 数组 |

---

## 5. Subgraph (5 个子图)

### 5.1 基本信息

- **托管平台**: Goldsky
- **查询接口**: GraphQL
- **开源仓库**: `Polymarket/polymarket-subgraph`

### 5.2 子图列表

| 子图 | 版本 | 用途 |
|------|------|------|
| **Orders** | v0.0.1 | 订单数据 |
| **Positions** | v0.0.7 | 用户持仓追踪 |
| **Activity** | v0.0.4 | 交易活动历史 |
| **Open Interest** | v0.0.6 | 市场持仓量指标 |
| **PNL** | v0.0.14 | 盈亏计算 |

### 5.3 用途场景

- **历史 PnL 查询**: Data API 只提供当前快照，历史 PnL 需要 PNL Subgraph
- **已结算持仓**: 结算后持仓从 Data API 消失，需查 Subgraph
- **链上验证**: 直接查询区块链数据

---

## 6. 关键差异总结

### 6.1 命名风格

| API | 风格 | 示例 |
|-----|------|------|
| Gamma | camelCase | `conditionId`, `outcomePrices` |
| CLOB | snake_case | `condition_id`, `token_id` |
| Data | camelCase | `proxyWallet`, `cashPnl` |

### 6.2 响应包装

| API | 格式 |
|-----|------|
| Gamma | 直接数组 `[...]` |
| CLOB | 包装对象 `{ data: [...] }` |
| Data | 直接数组 `[...]` |

### 6.3 时间戳格式

| API | 格式 | 示例 |
|-----|------|------|
| Gamma | ISO 8601 | "2024-01-04T17:33:51.332Z" |
| CLOB 订单簿 | 纳秒 | "1735148192681654827" |
| Data | Unix 秒 | 1730906255 |

### 6.4 需要解析的 JSON 字符串

| API | 字段 | 需要 `JSON.parse()` |
|-----|------|-------------------|
| Gamma | `outcomes` | ✅ |
| Gamma | `outcomePrices` | ✅ |
| Gamma | `clobTokenIds` | ✅ |

### 6.5 类型陷阱

| 字段 | 看起来是 | 实际是 | API |
|------|---------|--------|-----|
| `volume` | number | string | Gamma |
| `rank` | number | string | Data |
| `timestamp` | 毫秒 | 秒 | Data |
| `outcomes` | array | JSON string | Gamma |

---

## 7. SDK 实现差距分析

### 7.1 Data API 参数覆盖

| 端点 | SDK 当前 | 官方文档 | 差距 |
|------|---------|---------|------|
| `/positions` | user | user, market, eventId, title, sizeThreshold, redeemable, mergeable, limit, offset, sortBy, sortDirection | **严重不足** |
| `/trades` | limit, market | limit, offset, market, eventId, user, side, takerOnly, filterType, filterAmount | **严重不足** |
| `/activity` | user, limit, type | user, limit, offset, market, eventId, type, start, end, sortBy, sortDirection, side | **严重不足** |
| `/v1/leaderboard` | limit, offset | category, timePeriod, orderBy, limit, offset, user, userName | **部分缺失** |
| `/holders` | ❌ 未实现 | market, limit, minBalance | **完全缺失** |
| `/value` | ⚠️ 内部 | user, market | **未公开暴露** |

### 7.2 Gamma API 参数覆盖

| 端点 | SDK 当前 | 官方文档 | 差距 |
|------|---------|---------|------|
| `/markets` | limit, active, slug | tag_id, closed, active, order, ascending, limit, offset, related_tags, exclude_tag_id, slug | **部分缺失** |
| `/events` | limit, active | tag_id, closed, active, order, ascending, limit, offset, related_tags | **部分缺失** |
| `/tags` | ❌ | - | **未实现** |
| `/sports` | ❌ | - | **未实现** |
| `/search` | ❌ | - | **未实现** |

### 7.3 CLOB API 参数覆盖

| 端点 | SDK 当前 | 官方文档 | 差距 |
|------|---------|---------|------|
| `/book` | ✅ | token_id | 已实现 |
| `/books` | ❌ | token_ids | **未实现** |
| `/midpoint` | ❌ | token_id | **未实现** |
| `/price` | ❌ | token_id, side | **未实现** |
| `/prices` | ❌ | token_ids | **未实现** |
| `/spreads` | ❌ | token_ids | **未实现** |
| `/prices-history` | ❌ | token_id, interval | **未实现** |

### 7.4 Subgraph

完全未集成。

---

## 8. 修复优先级

### P0 - 影响核心功能

1. **Activity**: 添加 `start`, `end`, `offset`, `sortBy` 参数
2. **Trades**: 添加 `user`, `offset`, `side` 参数
3. **Positions**: 添加 `sortBy`, `sortDirection`, `limit`, `offset` 参数

### P1 - 功能完整性

4. **Leaderboard**: 添加 `category`, `timePeriod`, `orderBy` 参数
5. **Holders**: 新增端点
6. **Value**: 公开暴露为公共方法
7. **CLOB 价格端点**: `/midpoint`, `/price`, `/spreads`

### P2 - 增强

8. **Gamma 排序/分页**: `order`, `ascending`, `offset`
9. **Gamma 新端点**: `/tags`, `/sports`, `/search`
10. **CLOB 批量端点**: `/books`, `/prices`
11. **Subgraph 集成**: PNL 历史查询

---

## 9. 验证脚本

位置: `packages/poly-sdk/scripts/api-verification/`

```bash
# 运行验证
cd packages/poly-sdk
npx tsx scripts/api-verification/01-gamma-api.ts
npx tsx scripts/api-verification/02-clob-api.ts
npx tsx scripts/api-verification/03-data-api.ts
```

---

## 10. 参考链接

- [官方文档首页](https://docs.polymarket.com/)
- [API 端点列表](https://docs.polymarket.com/quickstart/introduction/endpoints)
- [CLOB 介绍](https://docs.polymarket.com/developers/CLOB/introduction)
- [Data API Core](https://docs.polymarket.com/api-reference/core/)
- [Gamma 获取市场指南](https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide)
- [Subgraph 仓库](https://github.com/Polymarket/polymarket-subgraph)

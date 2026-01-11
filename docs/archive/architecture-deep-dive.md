# Polymarket 架构深度解析

> 从底层原理到 SDK 设计
> 日期: 2025-12-25

---

## 1. Polymarket 运行原理

### 1.1 核心概念

Polymarket 是一个**预测市场平台**，让用户通过交易来表达对未来事件的预期。

```
传统博彩:                    预测市场:
用户 vs 庄家                 用户 vs 用户
固定赔率                     动态价格 (由市场决定)
庄家承担风险                  流动性提供者承担风险
```

### 1.2 三大核心模块

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Polymarket 技术架构                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐        │
│  │       CTF       │   │      CLOB       │   │       UMA       │        │
│  │ (Gnosis 开发)    │   │ (Polymarket)    │   │  (UMA Protocol) │        │
│  ├─────────────────┤   ├─────────────────┤   ├─────────────────┤        │
│  │ • 条件代币框架   │   │ • 中央限价订单簿 │   │ • 乐观预言机    │        │
│  │ • ERC-1155 代币  │   │ • 链下撮合      │   │ • 结果验证      │        │
│  │ • 仓位管理      │   │ • 链上结算      │   │ • 争议仲裁      │        │
│  │ • 代币铸造/赎回  │   │ • 订单匹配      │   │ • 代币持有者投票│        │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘        │
│           │                     │                     │                  │
│           └─────────────────────┼─────────────────────┘                  │
│                                 │                                        │
│                    ┌────────────┴────────────┐                           │
│                    │     Polygon 区块链       │                           │
│                    │   (所有交易最终结算)      │                           │
│                    └─────────────────────────┘                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.3 CTF - 条件代币框架

**来源**: Gnosis 开发的开源框架

**原理**:
```
1. 市场创建时，定义一个 "条件" (Condition)
   条件 = (oracle, questionId, outcomeSlotCount)

2. 生成 conditionId = keccak256(oracle, questionId, outcomeSlotCount)

3. 为每个可能结果创建一个 ERC-1155 代币
   - 二元市场: YES 代币 + NO 代币
   - 多选市场: A代币 + B代币 + C代币 + ...

4. 代币逻辑:
   - YES + NO = 1 USDC (完整概率集)
   - 市场结算后，获胜方代币 = 1 USDC，失败方 = 0
```

**代币操作**:
```
┌─────────────────────────────────────────────────────────────────┐
│                      CTF 代币操作                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  铸造 (Split):                                                  │
│  1 USDC → 1 YES + 1 NO                                         │
│                                                                 │
│  合并 (Merge):                                                  │
│  1 YES + 1 NO → 1 USDC                                         │
│                                                                 │
│  赎回 (Redeem): 市场结算后                                      │
│  如果 YES 赢: 1 YES → 1 USDC, 1 NO → 0                         │
│  如果 NO 赢:  1 YES → 0, 1 NO → 1 USDC                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 CLOB - 中央限价订单簿

**混合去中心化设计**:
```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOB 架构                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   链下 (Off-chain)              链上 (On-chain)                 │
│   ┌─────────────────┐           ┌─────────────────┐             │
│   │   Operator      │           │   Exchange      │             │
│   │   (运营商)       │  ──────▶  │   (智能合约)    │             │
│   ├─────────────────┤           ├─────────────────┤             │
│   │ • 接收订单      │           │ • 原子交换      │             │
│   │ • 价格匹配      │           │ • 代币转移      │             │
│   │ • 订单排序      │           │ • 非托管结算    │             │
│   └─────────────────┘           └─────────────────┘             │
│                                                                 │
│   用户签名 EIP-712 订单，Operator 无法篡改                       │
│   用户可以随时链上取消订单                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**关键特性 - 统一订单簿**:
```
由于 YES + NO = 1，买 YES @ P 等于卖 NO @ (1-P)

示例:
- 用户 A: 买 YES @ 0.60
- 用户 B: 卖 NO @ 0.40 (= 买 YES @ 0.60)

这两个订单会在同一个订单簿中匹配！

结果: 更深的流动性，更窄的价差
```

### 1.5 UMA - 乐观预言机

**结算流程**:
```
1. 市场到期
   │
2. 任何人可以提议结果 (需质押保证金)
   │
3. 挑战期 (2小时)
   │
   ├── 无人挑战 → 结果确认 → 代币结算
   │
   └── 有人挑战 → UMA 代币持有者投票 → 最终结果
```

---

## 2. API 分类与职责

### 2.1 三个 API 的定位

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Polymarket API 生态                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                         Gamma API                                   │  │
│  │                   (市场发现与元数据)                                 │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ 端点: https://gamma-api.polymarket.com                              │  │
│  │ 认证: 无需 (只读)                                                   │  │
│  │                                                                     │  │
│  │ 核心功能:                                                           │  │
│  │ • 浏览/搜索市场                                                     │  │
│  │ • 获取市场元数据 (标题、描述、分类)                                  │  │
│  │ • 查看事件分组                                                      │  │
│  │ • 获取趋势市场                                                      │  │
│  │ • 历史价格变化                                                      │  │
│  │                                                                     │  │
│  │ 数据模型: Event → Market (1:N)                                      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                         CLOB API                                    │  │
│  │                      (交易与订单簿)                                  │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ 端点: https://clob.polymarket.com                                   │  │
│  │ 认证: API Key + Secret + Passphrase (交易需要)                      │  │
│  │                                                                     │  │
│  │ 核心功能:                                                           │  │
│  │ • 获取实时订单簿                                                    │  │
│  │ • 下单/取消订单                                                     │  │
│  │ • 查看订单状态                                                      │  │
│  │ • 获取市场价格                                                      │  │
│  │ • WebSocket 实时推送                                                │  │
│  │                                                                     │  │
│  │ 数据模型: Market → Token (1:2), Order, Trade                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                         Data API                                    │  │
│  │                     (用户数据与分析)                                 │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ 端点: https://data-api.polymarket.com                               │  │
│  │ 认证: 无需 (只读)                                                   │  │
│  │                                                                     │  │
│  │ 核心功能:                                                           │  │
│  │ • 查看用户仓位                                                      │  │
│  │ • 查看用户交易历史                                                  │  │
│  │ • 排行榜数据                                                        │  │
│  │ • 市场交易记录                                                      │  │
│  │ • 账户价值计算                                                      │  │
│  │                                                                     │  │
│  │ 数据模型: Position, Activity, Trade, Leaderboard                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 API 使用场景

| 场景 | 使用 API | 原因 |
|------|---------|------|
| 浏览热门市场 | Gamma | 丰富的元数据和分类 |
| 搜索特定话题 | Gamma | 全文搜索支持 |
| 查看实时价格 | CLOB | 订单簿实时数据 |
| 下单交易 | CLOB | 订单管理 |
| 分析用户仓位 | Data | 用户级数据 |
| Smart Money 追踪 | Data | 排行榜 + 仓位 |
| 构建 K 线图 | CLOB + Data | 成交记录聚合 |

### 2.3 数据一致性

**同一市场在不同 API 中的表示**:

```typescript
// Gamma API 返回
{
  "id": "12345",                    // Gamma 内部 ID
  "conditionId": "0xabc...",        // ← 关联键
  "slug": "will-btc-100k",
  "question": "Will BTC reach $100k?",
  "outcomes": ["Yes", "No"],
  "outcomePrices": [0.65, 0.35],
  "volume24hr": 50000
}

// CLOB API 返回
{
  "condition_id": "0xabc...",       // ← 关联键
  "tokens": [
    { "token_id": "111...", "outcome": "Yes" },
    { "token_id": "222...", "outcome": "No" }
  ],
  "minimum_order_size": "5",
  "minimum_tick_size": "0.01"
}

// Data API 返回 (Position)
{
  "conditionId": "0xabc...",        // ← 关联键
  "asset": "111...",                // token_id
  "outcome": "Yes",
  "size": 100,
  "avgPrice": 0.60,
  "cashPnl": 5.0
}
```

---

## 3. 标识符体系

### 3.1 标识符关系图

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         标识符层次结构                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Event (Gamma)                                                          │
│   ├── eventId: "123"                                                     │
│   ├── slug: "2024-us-election"                                          │
│   │                                                                      │
│   └── Market 1 ─────────────────────────────────────────────────────    │
│       │                                                                  │
│       ├── questionId ◄─────────── 问题内容的 IPFS 哈希                   │
│       │   "0xdef..."                                                     │
│       │                                                                  │
│       ├── conditionId ◄────────── keccak256(oracle, questionId, 2)      │
│       │   "0xabc..."              核心关联键！                           │
│       │                                                                  │
│       ├── Gamma id: "12345"       Gamma 数据库内部 ID                    │
│       │                                                                  │
│       ├── slug: "will-trump-win"  URL 友好标识                          │
│       │                                                                  │
│       └── Tokens ────────────────────────────────────────────────────   │
│           │                                                              │
│           ├── YES Token                                                  │
│           │   └── tokenId: "111..." ◄── ERC-1155 资产 ID               │
│           │       (= asset 字段)                                         │
│           │                                                              │
│           └── NO Token                                                   │
│               └── tokenId: "222..."                                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 标识符详解

| 标识符 | 来源 | 格式 | 用途 |
|--------|------|------|------|
| **eventId** | Gamma | 数字字符串 | 事件分组 |
| **questionId** | CTF/IPFS | 0x + 64 hex | 问题内容哈希 |
| **conditionId** | CTF | 0x + 64 hex | **核心关联键** |
| **tokenId** | CTF | 数字字符串 | ERC-1155 资产 ID |
| **asset** | Data API | 同 tokenId | 持仓资产标识 |
| **slug** | Gamma | URL 字符串 | 人类可读标识 |
| **Gamma id** | Gamma | 数字字符串 | Gamma 内部 ID |

### 3.3 conditionId 生成原理

```solidity
// CTF 合约中的 conditionId 计算
conditionId = keccak256(
    abi.encodePacked(
        oracle,           // UMA oracle 地址
        questionId,       // 问题的 IPFS 哈希
        outcomeSlotCount  // 结果数量 (二元市场 = 2)
    )
)
```

### 3.4 tokenId 生成原理

```solidity
// 每个结果有一个 collectionId
collectionId[i] = CTF.getCollectionId(
    parentCollectionId,  // 通常为 0
    conditionId,
    indexSet            // 二进制表示：YES=1, NO=2
)

// tokenId = positionId
tokenId = CTF.getPositionId(
    collateralToken,     // USDC 地址
    collectionId
)
```

---

## 4. 数据流分析

### 4.1 市场生命周期

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         市场生命周期                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ① 创建阶段                                                             │
│  ┌──────────────┐                                                       │
│  │ 定义问题     │ → questionId (IPFS)                                   │
│  │ 选择预言机   │ → oracle address                                      │
│  │ 设定结果数   │ → outcomeSlotCount                                    │
│  └──────┬───────┘                                                       │
│         │                                                               │
│         ▼                                                               │
│  ┌──────────────┐                                                       │
│  │ CTF 部署     │ → conditionId, tokenIds                               │
│  │ FPMM 部署    │ → market address (AMM 备用)                           │
│  │ CLOB 注册    │ → 加入订单簿系统                                      │
│  └──────┬───────┘                                                       │
│         │                                                               │
│  ② 交易阶段                                                             │
│  ┌──────────────┐                                                       │
│  │ 用户下单     │ ← CLOB API (限价单)                                   │
│  │ 订单匹配     │ ← Operator (链下)                                     │
│  │ 交易结算     │ ← Exchange 合约 (链上)                                │
│  │ 价格更新     │ ← 供需平衡                                            │
│  └──────┬───────┘                                                       │
│         │                                                               │
│  ③ 结算阶段                                                             │
│  ┌──────────────┐                                                       │
│  │ 市场到期     │ → acceptingOrders = false                             │
│  │ 结果提议     │ ← UMA Oracle                                          │
│  │ 挑战期       │ ← 2 小时                                               │
│  │ 结果确定     │ → closed = true                                       │
│  └──────┬───────┘                                                       │
│         │                                                               │
│  ④ 赎回阶段                                                             │
│  ┌──────────────┐                                                       │
│  │ 代币赎回     │ → winning tokens → USDC                               │
│  │              │ → losing tokens → 0                                   │
│  └──────────────┘                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 交易数据流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           交易数据流                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  用户操作               API 交互                 数据存储               │
│                                                                         │
│  ┌─────────┐           ┌───────────┐           ┌─────────────┐         │
│  │ 浏览市场 │ ──────▶  │ Gamma API │ ◀──────── │ Gamma 数据库 │         │
│  └─────────┘           └───────────┘           └─────────────┘         │
│                                                                         │
│  ┌─────────┐           ┌───────────┐           ┌─────────────┐         │
│  │ 查看盘口 │ ──────▶  │ CLOB API  │ ◀──────── │ 订单簿内存   │         │
│  └─────────┘           └───────────┘           └─────────────┘         │
│                                                                         │
│  ┌─────────┐           ┌───────────┐           ┌─────────────┐         │
│  │ 下单    │ ──────▶   │ CLOB API  │ ──────▶   │ Operator    │         │
│  └─────────┘           └───────────┘           │ (撮合引擎)   │         │
│                                                 └──────┬──────┘         │
│                                                        │                │
│                                                        ▼                │
│                                                 ┌─────────────┐         │
│  ┌─────────┐           ┌───────────┐           │ Polygon     │         │
│  │查看仓位  │ ◀──────── │ Data API  │ ◀──────── │ 区块链      │         │
│  └─────────┘           └───────────┘           └─────────────┘         │
│                                                                         │
│  ┌─────────┐           ┌───────────┐           ┌─────────────┐         │
│  │Smart    │ ──────▶   │ Data API  │ ◀──────── │ 链上数据    │         │
│  │Money    │           │ (索引)    │           │ 索引服务    │         │
│  │分析     │           └───────────┘           └─────────────┘         │
│  └─────────┘                                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 数据结构设计

### 5.1 设计原则

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        数据结构设计原则                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 以 conditionId 为核心关联键                                         │
│     - 所有市场相关数据都通过 conditionId 关联                           │
│     - 跨 API 数据合并时以 conditionId 为准                              │
│                                                                         │
│  2. 分层存储不同时效性数据                                               │
│     - 静态数据: 市场元数据 (问题、描述、结束时间)                        │
│     - 动态数据: 价格、订单簿、成交量                                     │
│     - 用户数据: 仓位、交易历史、PnL                                      │
│                                                                         │
│  3. 支持多数据源合并                                                     │
│     - Gamma + CLOB → UnifiedMarket                                      │
│     - 保留 source 字段追溯来源                                           │
│                                                                         │
│  4. 时间序列数据独立存储                                                 │
│     - 价格历史、成交历史需要时间索引                                     │
│     - 支持按时间范围查询                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 核心数据结构

```typescript
// ============================================================
// 层级 1: 标识符 (Identifiers)
// ============================================================

/**
 * 市场标识符集合
 * 用于跨 API 关联数据
 */
interface MarketIdentifiers {
  // 核心标识 (必须)
  conditionId: string;           // CTF 条件 ID - 主键

  // 代币标识
  yesTokenId: string;            // YES 代币的 ERC-1155 ID
  noTokenId: string;             // NO 代币的 ERC-1155 ID

  // 其他标识 (可选)
  questionId?: string;           // IPFS 问题哈希
  gammaId?: string;              // Gamma 内部 ID
  slug?: string;                 // URL 友好标识
  eventId?: string;              // 所属事件 ID
}

// ============================================================
// 层级 2: 市场 (Market)
// ============================================================

/**
 * 统一市场数据结构
 * 合并 Gamma + CLOB 数据
 */
interface UnifiedMarket {
  // 标识符
  identifiers: MarketIdentifiers;

  // 元数据 (来自 Gamma)
  metadata: {
    question: string;
    description?: string;
    category?: string;
    tags?: string[];
    image?: string;
    endDate: Date;
    createdAt?: Date;
  };

  // 市场状态
  status: {
    active: boolean;
    closed: boolean;
    resolved: boolean;
    acceptingOrders: boolean;
    winningOutcome?: 'yes' | 'no';  // 结算后填充
  };

  // 价格数据 (来自 CLOB)
  pricing: {
    yesPrice: number;
    noPrice: number;
    midpoint: number;
    spread: number;
    lastUpdated: Date;
  };

  // 流动性数据
  liquidity: {
    total: number;
    yesBidDepth: number;
    yesAskDepth: number;
    noBidDepth: number;
    noAskDepth: number;
  };

  // 成交量数据
  volume: {
    total: number;
    volume24h: number;
    volume7d: number;
    tradeCount24h?: number;
  };

  // 价格变化
  priceChange?: {
    change1h?: number;
    change24h?: number;
    change7d?: number;
  };

  // 数据来源
  source: 'gamma' | 'clob' | 'merged';
  fetchedAt: Date;
}

// ============================================================
// 层级 3: 订单簿 (Orderbook)
// ============================================================

/**
 * 订单簿快照
 */
interface OrderbookSnapshot {
  conditionId: string;
  timestamp: Date;

  yes: {
    bids: PriceLevel[];
    asks: PriceLevel[];
    bestBid: number;
    bestAsk: number;
    spread: number;
  };

  no: {
    bids: PriceLevel[];
    asks: PriceLevel[];
    bestBid: number;
    bestAsk: number;
    spread: number;
  };

  // 有效价格 (考虑镜像订单)
  effective: {
    buyYes: number;    // min(yes.ask, 1 - no.bid)
    buyNo: number;     // min(no.ask, 1 - yes.bid)
    sellYes: number;   // max(yes.bid, 1 - no.ask)
    sellNo: number;    // max(no.bid, 1 - yes.ask)
  };

  // 套利分析
  arbitrage: {
    longCost: number;      // buyYes + buyNo
    shortRevenue: number;  // sellYes + sellNo
    longProfit: number;    // 1 - longCost
    shortProfit: number;   // shortRevenue - 1
    opportunity: 'long' | 'short' | 'none';
  };
}

interface PriceLevel {
  price: number;
  size: number;
  depth: number;  // 累计深度
}

// ============================================================
// 层级 4: 用户数据 (User Data)
// ============================================================

/**
 * 用户仓位
 */
interface Position {
  // 标识
  walletAddress: string;
  conditionId: string;
  tokenId: string;
  outcome: 'yes' | 'no';

  // 持仓数据
  size: number;
  avgPrice: number;
  currentPrice: number;

  // PnL
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;

  // 成本基础
  totalCost: number;
  currentValue: number;

  // 状态
  redeemable: boolean;

  // 市场元数据快照
  marketTitle: string;
  marketSlug?: string;
  marketEndDate: Date;
}

/**
 * 用户活动/交易记录
 */
interface UserActivity {
  // 标识
  walletAddress: string;
  transactionHash: string;

  // 活动类型
  type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD' | 'CONVERSION';
  side?: 'BUY' | 'SELL';

  // 交易数据
  conditionId: string;
  tokenId: string;
  outcome: string;
  size: number;
  price: number;
  usdcValue: number;

  // 时间
  timestamp: Date;

  // 市场元数据快照
  marketTitle?: string;
  marketSlug?: string;
}

/**
 * 用户档案
 */
interface UserProfile {
  walletAddress: string;
  displayName?: string;

  // 排名
  rank?: number;

  // 表现
  performance: {
    totalPnl: number;           // 官方 PnL (来自排行榜)
    realizedPnl: number;        // 已实现 PnL
    unrealizedPnl: number;      // 未实现 PnL
    totalVolume: number;
    positionCount: number;
    tradeCount: number;
    winRate: number;
    avgPnlPercent: number;
    smartScore: number;         // 0-100
  };

  // 活跃度
  activity: {
    lastTradeAt?: Date;
    isActive: boolean;          // 7天内有交易
    firstTradeAt?: Date;
  };

  fetchedAt: Date;
}

// ============================================================
// 层级 5: 时间序列数据 (Time Series)
// ============================================================

/**
 * 价格 K 线
 */
interface PriceCandle {
  conditionId: string;
  tokenId: string;
  outcome: 'yes' | 'no';
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

  // OHLCV
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
}

/**
 * 成交记录
 */
interface TradeRecord {
  // 标识
  transactionHash: string;
  conditionId: string;
  tokenId: string;

  // 交易数据
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  outcome: string;

  // 交易者 (可选)
  makerAddress?: string;
  takerAddress?: string;

  // 时间
  timestamp: Date;
}

/**
 * 订单簿历史快照 (需要自行采集)
 */
interface OrderbookHistoryPoint {
  conditionId: string;
  timestamp: Date;

  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;

  askSum: number;
  bidSum: number;

  longArbProfit: number;
  shortArbProfit: number;
}

// ============================================================
// 层级 6: 聚合与分析 (Aggregation & Analysis)
// ============================================================

/**
 * 用户交易汇总 (按市场)
 */
interface UserMarketSummary {
  walletAddress: string;
  conditionId: string;
  marketTitle: string;

  // 交易统计
  totalBuys: number;
  totalSells: number;
  buyVolume: number;
  sellVolume: number;
  netPosition: number;

  // 时间范围
  firstTradeAt: Date;
  lastTradeAt: Date;

  // PnL (如果市场已结算)
  realizedPnl?: number;
  outcome?: 'win' | 'loss' | 'pending';
}

/**
 * 用户时间段汇总
 */
interface UserPeriodSummary {
  walletAddress: string;
  period: '1d' | '1w' | '1m' | 'all';
  startDate: Date;
  endDate: Date;

  // 交易统计
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  totalVolume: number;

  // 活跃市场
  activeMarkets: number;
  uniqueMarkets: string[];

  // PnL
  realizedPnl: number;
  unrealizedPnl: number;
}
```

### 5.3 数据关系图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          数据实体关系                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐                                                       │
│   │   Event     │ 1                                                     │
│   │ (Gamma)     │────────┐                                              │
│   └─────────────┘        │                                              │
│                          │ N                                            │
│                    ┌─────┴───────┐                                      │
│                    │   Market    │ ◄──── 核心实体                       │
│                    │ (Unified)   │                                      │
│                    └──────┬──────┘                                      │
│                           │                                             │
│         ┌─────────────────┼─────────────────┐                           │
│         │                 │                 │                           │
│         ▼                 ▼                 ▼                           │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐                       │
│   │  Token    │    │ Orderbook │    │  Trades   │                       │
│   │ (YES/NO)  │    │ (实时)    │    │ (历史)    │                       │
│   └─────┬─────┘    └───────────┘    └─────┬─────┘                       │
│         │                                 │                             │
│         │                                 │                             │
│         ▼                                 ▼                             │
│   ┌───────────┐                    ┌───────────┐                        │
│   │ Position  │◄───────────────────│ Activity  │                        │
│   │ (用户持仓) │                    │ (用户交易) │                        │
│   └─────┬─────┘                    └─────┬─────┘                        │
│         │                                │                              │
│         └────────────────┬───────────────┘                              │
│                          │                                              │
│                          ▼                                              │
│                    ┌───────────┐                                        │
│                    │   User    │                                        │
│                    │ (Profile) │                                        │
│                    └───────────┘                                        │
│                                                                         │
│   关系说明:                                                              │
│   • Event 1:N Market (一个事件包含多个市场)                              │
│   • Market 1:2 Token (每个市场有 YES/NO 两个代币)                       │
│   • Market 1:1 Orderbook (每个市场一个订单簿)                           │
│   • Market 1:N Trades (每个市场多条成交记录)                            │
│   • User 1:N Position (用户持有多个仓位)                                │
│   • User 1:N Activity (用户有多条交易记录)                              │
│   • Position N:1 Token (多个用户持有同一代币)                           │
│   • Activity N:1 Market (多条交易属于同一市场)                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. SDK 架构设计

### 6.1 当前 SDK 结构

```
poly-sdk/
├── src/
│   ├── core/                    # 核心模块
│   │   ├── types.ts             # 类型定义
│   │   ├── errors.ts            # 错误处理
│   │   ├── rate-limiter.ts      # 限流
│   │   ├── unified-cache.ts     # 缓存
│   │   └── cache-adapter-bridge.ts
│   │
│   ├── clients/                 # API 客户端
│   │   ├── gamma-api.ts         # 市场发现
│   │   ├── clob-api.ts          # 订单簿 & 交易
│   │   ├── data-api.ts          # 用户数据
│   │   ├── trading-client.ts    # 交易执行
│   │   ├── ctf-client.ts        # 条件代币操作
│   │   ├── bridge-client.ts     # 跨链桥
│   │   └── websocket-manager.ts # 实时推送
│   │
│   ├── services/                # 业务服务
│   │   ├── market-service.ts    # 市场数据聚合
│   │   ├── wallet-service.ts    # Smart Money 分析
│   │   ├── realtime-service.ts  # 实时数据
│   │   ├── swap-service.ts      # 代币交换
│   │   ├── arbitrage-service.ts # 套利服务
│   │   └── authorization-service.ts
│   │
│   └── utils/                   # 工具函数
│       └── price-utils.ts
```

### 6.2 建议的分层架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SDK 分层架构                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Layer 4: Application                        │   │
│  │                         (业务场景)                                │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  SmartMoneyTracker    ArbitrageBot    CopyTrader    Analytics   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────┼───────────────────────────────┐   │
│  │                      Layer 3: Services                           │   │
│  │                       (业务逻辑)                                  │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  MarketService     WalletService     TradingService             │   │
│  │  RealtimeService   ArbitrageService  PositionService            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────┼───────────────────────────────┐   │
│  │                      Layer 2: Clients                            │   │
│  │                       (API 封装)                                  │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  GammaClient    ClobClient    DataClient    CTFClient           │   │
│  │  TradingClient  BridgeClient  WebSocketManager                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────┼───────────────────────────────┐   │
│  │                      Layer 1: Core                               │   │
│  │                      (基础设施)                                   │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  Types       RateLimiter    Cache       Errors     Utils        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────┼───────────────────────────────┐   │
│  │                      Layer 0: Storage (新增)                     │   │
│  │                       (数据持久化)                                │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  PositionStore   ActivityStore   MarketStore   HistoryStore    │   │
│  │  (仓位存储)       (活动存储)      (市场缓存)    (历史数据)        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.3 建议新增模块

```typescript
// ============================================================
// Layer 0: Storage (新增)
// ============================================================

/**
 * 仓位存储 - 支持历史追踪
 */
interface PositionStore {
  // 保存仓位快照
  saveSnapshot(positions: Position[]): Promise<void>;

  // 获取指定时间的仓位
  getPositionsAt(walletAddress: string, timestamp: Date): Promise<Position[]>;

  // 获取仓位变化历史
  getPositionHistory(
    walletAddress: string,
    conditionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PositionSnapshot[]>;
}

/**
 * 活动存储 - 支持完整历史
 */
interface ActivityStore {
  // 保存活动记录
  saveActivities(activities: UserActivity[]): Promise<void>;

  // 按时间范围查询
  getActivities(
    walletAddress: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      type?: ActivityType;
      conditionId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<UserActivity[]>;

  // 获取全部活动 (自动分页)
  getAllActivities(walletAddress: string): Promise<UserActivity[]>;
}

/**
 * 订单簿历史存储 (用于套利分析)
 */
interface OrderbookStore {
  // 保存快照
  saveSnapshot(snapshot: OrderbookSnapshot): Promise<void>;

  // 获取历史
  getHistory(
    conditionId: string,
    startDate: Date,
    endDate: Date,
    interval: '1m' | '5m' | '1h'
  ): Promise<OrderbookHistoryPoint[]>;
}

// ============================================================
// Layer 2: Enhanced Clients
// ============================================================

/**
 * 增强的 Data API 客户端
 */
interface EnhancedDataClient extends DataApiClient {
  // 按时间范围获取活动
  getActivityByTimeRange(
    address: string,
    startDate: Date,
    endDate: Date
  ): Promise<Activity[]>;

  // 获取全部活动 (自动处理分页)
  getAllActivity(address: string): Promise<Activity[]>;

  // 按时间段获取
  getActivityByPeriod(
    address: string,
    period: '1d' | '1w' | '1m' | 'all'
  ): Promise<Activity[]>;
}

// ============================================================
// Layer 3: New Services
// ============================================================

/**
 * 用户分析服务
 */
interface UserAnalyticsService {
  // 获取完整交易历史
  getFullTradeHistory(address: string): Promise<UserActivity[]>;

  // 按市场汇总
  summarizeByMarket(address: string): Promise<UserMarketSummary[]>;

  // 按时间段汇总
  summarizeByPeriod(
    address: string,
    period: '1d' | '1w' | '1m'
  ): Promise<UserPeriodSummary>;

  // 获取 PnL 时间序列
  getPnLTimeSeries(
    address: string,
    startDate: Date,
    endDate: Date,
    interval: '1d' | '1w'
  ): Promise<PnLDataPoint[]>;

  // 分析交易模式
  analyzeTradePatterns(address: string): Promise<TradePatternAnalysis>;
}

/**
 * 历史数据服务
 */
interface HistoryService {
  // 价格历史
  getPriceHistory(
    conditionId: string,
    startDate: Date,
    endDate: Date,
    interval: KLineInterval
  ): Promise<PriceCandle[]>;

  // 成交历史
  getTradeHistory(
    conditionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TradeRecord[]>;

  // 订单簿历史 (需要自行采集)
  getOrderbookHistory(
    conditionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<OrderbookHistoryPoint[]>;
}
```

---

## 7. 实施路线图

### Phase 1: 基础增强 (1-2 周)

```
✅ 增强 Data API 客户端
   ├── 添加 start/end/offset 参数
   ├── 添加自动分页逻辑
   └── 添加时间段便捷方法

✅ 增强 Positions 获取
   ├── 添加 sortBy 参数 (CASHPNL, PERCENTPNL)
   └── 添加分页支持
```

### Phase 2: 服务层增强 (2-3 周)

```
⬜ 新增 UserAnalyticsService
   ├── 完整交易历史获取
   ├── 市场维度汇总
   └── 时间维度汇总

⬜ 新增 HistoryService
   ├── 价格 K 线构建
   └── 成交历史聚合
```

### Phase 3: 存储层 (3-4 周)

```
⬜ 设计存储接口
   ├── PositionStore
   ├── ActivityStore
   └── OrderbookStore

⬜ 实现存储适配器
   ├── 内存存储 (测试)
   ├── SQLite (单机)
   └── PostgreSQL (生产)
```

### Phase 4: Subgraph 集成 (4-5 周)

```
⬜ 集成 Goldsky Subgraph
   ├── PnL Subgraph
   ├── Positions Subgraph
   └── Activity Subgraph

⬜ 提供历史 PnL 时间序列
```

---

## 8. 总结

### 8.1 Polymarket 技术本质

```
Polymarket = CTF (代币框架) + CLOB (订单簿) + UMA (预言机)
           = 链上资产 + 链下撮合 + 去中心化结算
```

### 8.2 API 分工

| API | 定位 | 数据特点 |
|-----|------|---------|
| **Gamma** | 市场发现 | 丰富元数据，适合浏览 |
| **CLOB** | 交易执行 | 实时价格，订单簿 |
| **Data** | 用户分析 | 历史交易，仓位 PnL |

### 8.3 核心设计决策

1. **conditionId 为核心关联键** - 跨 API 数据合并的基础
2. **分层数据结构** - 静态/动态/用户数据分离
3. **时间序列独立** - 支持历史查询和分析
4. **存储层可插拔** - 支持不同持久化方案

### 8.4 当前差距

| 能力 | 现状 | 目标 |
|------|------|------|
| 历史交易查询 | ❌ 最多100条 | ✅ 全部历史 |
| 时间范围过滤 | ❌ 不支持 | ✅ start/end |
| PnL 时间序列 | ❌ 无 | ✅ Subgraph |
| 数据持久化 | ❌ 无 | ✅ Store 层 |

---

## 参考资料

- [Polymarket Documentation](https://docs.polymarket.com/)
- [CLOB Introduction](https://docs.polymarket.com/developers/CLOB/introduction)
- [Gamma Structure](https://docs.polymarket.com/developers/gamma-markets-api/gamma-structure)
- [How Polymarket Works - RockNBlock](https://rocknblock.io/blog/how-polymarket-works-the-tech-behind-prediction-markets)
- [Polymarket Architecture - Auditless Research](https://research.auditless.com/p/al-71-how-polymarkets-architecture)
- [Gnosis Conditional Token Framework](https://docs.gnosis.io/conditionaltokens/)
- [UMA Optimistic Oracle](https://docs.umaproject.org/)

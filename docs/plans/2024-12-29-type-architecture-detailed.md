# Poly-SDK 类型架构详细计划

> 创建时间: 2024-12-29
> 目标: 建立清晰的 Client 层 / Service 层类型分离

---

## 核心理解

### 你的想法（我理解的）

```
External APIs (CLOB, Gamma, Data API, WebSocket)
         ↓
    Client 层 - API 原始结构（我们控制不了）
         ↓
    转换层 - 明确的映射逻辑
         ↓
    Service 层 - SDK 公开类型（我们要设计好）
         ↓
    用户代码
```

**关键区分**：
- **Client 层类型**：来自外部 API，命名风格不一致（snake_case, camelCase 混杂），我们不能改变
- **SDK 公开类型**：我们设计的，给用户用的，应该一致、清晰、设计良好

---

## 当前状态分析

### 类型来源

| 来源 | 命名风格 | 类型位置 | 转换情况 |
|------|----------|----------|----------|
| @polymarket/clob-client | snake_case | 外部包 | market-service.ts 有转换 |
| Gamma API | 已 camelCase | gamma-api.ts | 内部已转换 |
| Data API | 已 camelCase | data-api.ts | 有 normalize 函数 |
| WebSocket | snake_case | 外部包 | realtime-service 有转换 |

### 当前问题

| 问题 | 严重性 | 影响 |
|------|--------|------|
| ClobMarket 在 market-service.ts 里内联定义 | MEDIUM | Client 类型和 Service 类型混在一起 |
| index.ts 和 market-service.ts 有重复转换逻辑 | HIGH | 代码重复，可能行为不一致 |
| assetId vs tokenId 命名不一致 | MEDIUM | 用户困惑 |
| 多个 Trade 类型定义 | MEDIUM | TradeInfo, ActivityTrade, ParsedTrade 不统一 |

### 好的地方（不需要改）

- `core/types.ts` 作为统一类型定义位置 ✅
- `data-api.ts` 有完整的 normalize 函数 ✅
- `gamma-api.ts` 内部已经做了转换 ✅
- Service 层对外暴露的类型是 camelCase ✅

---

## 设计决策

### 决策 1: 类型文件组织

**选项 A**: 在每个 client 文件旁边定义原始类型
```
src/clients/
├── gamma-api.ts
├── gamma-api.types.ts     # Gamma API 原始类型
├── data-api.ts
├── data-api.types.ts      # Data API 原始类型
└── clob-client.types.ts   # CLOB 原始类型（外部包补充）
```

**选项 B**: 集中在一个 client-types 目录
```
src/clients/
├── types/
│   ├── clob.ts
│   ├── gamma.ts
│   └── data-api.ts
├── gamma-api.ts
└── data-api.ts
```

**选项 C**: 保持现状，只修复具体问题
- 不创建新文件，只移动内联定义到 core/types.ts 的专门区域

**建议**: 选项 C - 因为：
1. 外部包的类型我们不需要重新定义
2. 内联定义数量不多（主要是 ClobMarket）
3. 避免过度工程化

---

### 决策 2: SDK 公开类型设计

**核心 SDK 类型（在 core/types.ts）**:

```typescript
// ===== 基础类型 =====
export type Side = 'BUY' | 'SELL';
export type OrderType = 'GTC' | 'FOK' | 'GTD' | 'FAK';

// ===== Market 类型 =====
// 这是 SDK 对外暴露的统一 Market 类型
export interface Market {
  conditionId: string;
  questionId?: string;
  slug: string;
  question: string;
  tokens: {
    yes: MarketToken;
    no: MarketToken;
  };
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  endDate?: Date;
  // 扩展字段（可选）
  volume24h?: number;
  liquidity?: number;
}

export interface MarketToken {
  tokenId: string;        // 统一使用 tokenId，不用 assetId
  outcome: 'Yes' | 'No';
  price: number;
  winner?: boolean;
}

// ===== Orderbook 类型 =====
export interface Orderbook {
  tokenId: string;        // 统一使用 tokenId
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
  // 可选的扩展字段
  spread?: number;
  midpoint?: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

// ===== Trade 类型 =====
// 统一的交易记录类型
export interface Trade {
  id?: string;
  tokenId: string;
  side: Side;
  price: number;
  size: number;
  timestamp: number;
  fee?: number;
  // 上下文信息（可选）
  conditionId?: string;
  transactionHash?: string;
  trader?: {
    address: string;
    name?: string;
  };
}

// ===== Position 类型 =====
export interface Position {
  tokenId: string;
  conditionId?: string;
  outcome: 'Yes' | 'No';
  size: number;
  avgPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
}

// ===== Order 类型 =====
export interface Order {
  id: string;
  tokenId: string;
  side: Side;
  type: OrderType;
  price: number;
  size: number;
  filledSize: number;
  remainingSize: number;
  status: 'live' | 'filled' | 'cancelled' | 'matched';
  createdAt: number;
}
```

---

### 决策 3: 命名一致性

| 概念 | API 中的名称 | SDK 统一名称 | 说明 |
|------|-------------|--------------|------|
| Token ID | asset_id, token_id | `tokenId` | 统一用 tokenId |
| Condition ID | condition_id | `conditionId` | 市场的唯一标识 |
| 市场 slug | market_slug | `slug` | 简化命名 |
| 订单状态 | LIVE, FILLED | `live`, `filled` | 小写 |

---

## 执行计划

### Phase 1: 整理 Client 层类型定义

**目标**: 把内联的 API 类型移到合适的位置

- [ ] Step 1: 在 core/types.ts 添加 "Client Types" 区域（用注释分隔）
- [ ] Step 2: 移动 market-service.ts 中的 ClobMarket 接口
- [ ] Step 3: 确保所有转换函数有清晰的类型标注

### Phase 2: 消除重复转换逻辑

**目标**: 确保转换逻辑只在一个地方

- [ ] Step 4: 比较 index.ts 和 market-service.ts 的 mergeMarkets() 实现
- [ ] Step 5: 删除 index.ts 中的重复实现，改为调用 MarketService
- [ ] Step 6: 同样处理 fromGammaMarket(), fromClobMarket()

### Phase 3: 统一命名

**目标**: assetId -> tokenId

- [ ] Step 7: 在 Orderbook 相关类型中统一使用 tokenId
- [ ] Step 8: 更新 realtime-service-v2.ts 的类型
- [ ] Step 9: 运行 TypeScript 编译验证

### Phase 4: Trade 类型整理

**目标**: 减少 Trade 类型变体

当前状态:
- TradeInfo (trading-service.ts) - 基础交易
- ActivityTrade (realtime-service-v2.ts) - WebSocket 交易
- ParsedTrade (wallet-service.ts) - 钱包分析用

设计决策:
- 保留 Trade 作为基础类型（core/types.ts）
- ActivityTrade extends Trade（添加实时字段）
- ParsedTrade 可以重命名为 WalletTrade 并 extends Trade

- [ ] Step 10: 在 core/types.ts 定义基础 Trade 类型
- [ ] Step 11: 更新其他 Trade 变体 extends 基础类型
- [ ] Step 12: 保持向后兼容的导出

### Phase 5: Market 类型整理

**目标**: 清晰区分 Raw Market vs SDK Market

当前状态:
- ClobMarket (CLOB 原始格式, tokens 是数组)
- GammaMarket (Gamma 格式)
- Market (market-service.ts 定义)
- UnifiedMarket (core/types.ts, tokens 是对象)

设计决策:
- `Market` = SDK 公开类型（tokens 是 { yes, no } 对象）
- 原始格式类型保留在 Client 层（内部使用）
- 删除或合并 UnifiedMarket（它就是 Market）

- [ ] Step 13: 确定 Market 的最终结构
- [ ] Step 14: 更新 market-service.ts 的 Market 类型
- [ ] Step 15: 合并 UnifiedMarket 到 Market
- [ ] Step 16: 更新所有使用处

---

## 验证清单

### 类型架构
- [ ] Client 类型和 SDK 类型有清晰的分隔（通过注释或位置）
- [ ] 没有重复的转换逻辑
- [ ] 命名一致（tokenId, conditionId, camelCase）
- [ ] TypeScript 编译通过
- [ ] 向后兼容（旧的导出仍然可用）

### 用户体验
- [ ] 用户只看到 SDK 类型，不需要知道 API 格式
- [ ] 类型有清晰的 JSDoc 文档
- [ ] 导出的类型名称直观（Market, Trade, Order, Position）

---

## 风险与权衡

### 为什么不创建独立的 Client 类型文件？

1. **过度工程化风险**: 大多数 API 类型来自外部包，我们不需要重新定义
2. **维护成本**: 更多文件 = 更多维护
3. **实际问题不大**: 只有 ClobMarket 是内联定义的

### 为什么 tokenId 而不是 assetId？

1. **语义更清晰**: Polymarket 的概念是 "token"，不是 "asset"
2. **用户视角**: 用户谈论的是 "YES token", "NO token"
3. **一致性**: 大多数地方已经用 tokenId

### 向后兼容性

所有改动需要保持向后兼容：
- 旧的类型名仍然导出（作为别名）
- 旧的字段保留（可以标记 deprecated）

---

## 需要你确认的问题

1. **Market.tokens 结构**:
   - 选项 A: `{ yes: MarketToken, no: MarketToken }` (对象)
   - 选项 B: `MarketToken[]` (数组)
   - 推荐 A，因为更清晰，你同意吗？

2. **Phase 优先级**:
   - 推荐先做 Phase 1-3（整理和统一命名）
   - Phase 4-5（Trade/Market）可以后续再做
   - 你同意这个顺序吗？

3. **是否需要更激进的重构？**
   - 当前计划是渐进式的，保持向后兼容
   - 如果你觉得可以 breaking change，我们可以更激进

# Poly-SDK 文档与数据模型重构计划

> 创建时间: 2024-12-29
> 目标: 让开发者能快速找到需要的信息，理解 SDK 并开始使用

---

## 目标驱动思考

### 我们在做什么，为了什么？

**目标**: 做一个真正好用的 poly-sdk，支持数据分析和策略执行

**从目标出发**:
- 如果文档结构混乱 → 开发者找不到信息 → 放弃使用
- 如果数据模型不统一 → 类型转换出错 → SDK 不可靠
- 如果概念重复定义 → 维护困难 → 代码质量下降

---

## Part 1: 文档重构

### 当前问题

| 问题 | 影响 |
|------|------|
| 两个 `00-` 开头的文件 | 不知道从哪开始 |
| 内容重叠 | 浪费时间，困惑 |
| 设计过程文档和使用文档混在一起 | 开发者不需要看设计反思 |
| 没有导航入口 | 找不到需要的文档 |

### 目标结构

```
docs/
├── README.md                        # 入口导航 (新建)
│
├── concepts/                        # 概念理解 (给学习者)
│   └── polymarket-principles.md     # Polymarket 运行原理
│
├── architecture/                    # SDK 架构 (给贡献者)
│   ├── 01-overview.md               # Service 层设计
│   ├── 02-websocket.md              # WebSocket 实现
│   └── 03-data-model.md             # 数据模型设计
│
├── api/                             # API 参考 (给开发者)
│   ├── 01-overview.md               # API 概览
│   ├── 02-leaderboard.md            # 排行榜 API
│   └── 03-position-activity.md      # 持仓活动 API
│
├── guides/                          # 实践指南 (给开发者)
│   ├── copy-trading.md              # Copy Trading 指南
│   └── arbitrage.md                 # 套利指南
│
├── plans/                           # 计划文档
│   └── (本文件)
│
└── archive/                         # 归档 (设计过程，非必读)
    ├── design-retrospective.md
    ├── architecture-deep-dive.md
    └── api-verification.md
```

### 文件映射表

| 原文件 | 目标位置 | 操作 |
|--------|----------|------|
| design/01-polymarket-principles.md | concepts/polymarket-principles.md | 移动 |
| design/04-new-architecture.md | architecture/01-overview.md | 移动+重命名 |
| design/05-websocket.md | architecture/02-websocket.md | 移动+重命名 |
| design/03-datamodel.md | architecture/03-data-model.md | 移动+重命名 |
| 02-API.md | api/01-overview.md | 移动+重命名 |
| 03-leaderboard.md | api/02-leaderboard.md | 移动+重命名 |
| 04-position-activity.md | api/03-position-activity.md | 移动+重命名 |
| 05-copy-trading-analysis.md | guides/copy-trading.md | 移动+精简 |
| design/00-design-retrospective.md | archive/design-retrospective.md | 归档 |
| design/00-polymarket-architecture-deep-dive.md | archive/architecture-deep-dive.md | 归档 |
| design/02-api-verification.md | archive/api-verification.md | 归档 |
| 00-design.md | archive/old-design.md | 归档 (被新架构文档取代) |

### 执行步骤

- [x] Step 1: 创建目录结构
- [x] Step 2: 移动和重命名文件
- [x] Step 3: 创建 docs/README.md 导航页
- [x] Step 4: 更新文档内部的交叉引用链接
- [x] Step 5: 删除空的 design/ 目录

---

## Part 2: 数据模型重构

### 当前问题

| 问题 | 严重性 | 影响 |
|------|--------|------|
| `Side` 类型重复定义 | HIGH | trading-service + market-service 都定义了 |
| `Market` 类型碎片化 | HIGH | 3 个不兼容的 Market 表示 |
| `Trade` 类型混乱 | MEDIUM | TradeInfo, ActivityTrade, ParsedTrade 不统一 |
| `Orderbook` 类型不一致 | MEDIUM | Orderbook vs OrderbookSnapshot |
| `Position` 类型重复 | MEDIUM | TokenPosition vs TraderPosition |

### 类型重复详情

```
Side 定义位置:
├── trading-service.ts:42  → export type Side = 'BUY' | 'SELL';
└── market-service.ts:48   → export type Side = 'BUY' | 'SELL';

Market 定义位置:
├── market-service.ts:103  → Market (CLOB 格式, tokens 是数组)
├── core/types.ts:322      → UnifiedMarket (统一格式, tokens 是对象)
└── index.ts              → 转换逻辑重复

Trade 定义位置:
├── trading-service.ts:99  → TradeInfo (基础交易信息)
├── realtime-service-v2.ts:109 → ActivityTrade (带市场上下文)
└── wallet-service.ts:53   → ParsedTrade (带金额分解)
```

### 目标: 统一类型到 core/types.ts

```typescript
// ===== 基础类型 =====
export type Side = 'BUY' | 'SELL';
export type OrderType = 'GTC' | 'FOK' | 'GTD' | 'FAK';

// ===== 订单类型 =====
export interface LimitOrderParams { ... }
export interface MarketOrderParams { ... }
export interface Order { ... }
export interface OrderResult { ... }

// ===== Orderbook 类型 (合并) =====
export interface Orderbook {
  assetId: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
  market?: string;
  hash?: string;
  tickSize?: string;      // 来自 OrderbookSnapshot
  minOrderSize?: string;  // 来自 OrderbookSnapshot
}

// ===== 交易类型 =====
export interface Trade {
  id?: string;
  tokenId: string;        // 统一使用 tokenId
  conditionId?: string;   // 可选市场上下文
  side: Side;
  price: number;
  size: number;
  fee?: number;
  timestamp: number;
  transactionHash?: string;
  trader?: { name?: string; address?: string };
}

// ===== 持仓类型 =====
export interface Position {
  tokenId: string;
  conditionId?: string;
  amount: number;
  avgCost?: number;
  totalCost?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
}
```

### 执行步骤

#### Phase 1: 基础类型统一 (HIGH PRIORITY) ✅

- [x] Step 1: 将 `Side`, `OrderType` 移到 core/types.ts
- [x] Step 2: 更新 trading-service.ts 从 core/types.ts 导入
- [x] Step 3: 更新 market-service.ts 从 core/types.ts 导入
- [x] Step 4: 更新 index.ts 的导出

#### Phase 2: Orderbook 类型合并 (MEDIUM PRIORITY) ✅

- [x] Step 5: 在 core/types.ts 创建统一的 `Orderbook` 接口
- [x] Step 6: 更新 market-service.ts 使用统一类型
- [x] Step 7: 更新 realtime-service-v2.ts 使用统一类型
- [x] Step 8: OrderbookSnapshot 现在 extends Orderbook (保留扩展字段)

#### Phase 3: Trade 类型整理 (MEDIUM PRIORITY)

- [ ] Step 9: 在 core/types.ts 创建统一的 `Trade` 接口
- [ ] Step 10: 保留 `ActivityTrade` 作为 `Trade` 的扩展 (带市场上下文)
- [ ] Step 11: 更新各 service 使用统一类型

#### Phase 4: Market 类型整理 (需要更多设计)

- [ ] Step 12: 确定 Market vs UnifiedMarket 的关系
- [ ] Step 13: 考虑是否需要两个层次:
  - `ClobMarket`: 来自 CLOB API 的原始格式
  - `Market`: SDK 内部统一格式 (= 当前的 UnifiedMarket)
- [ ] Step 14: 统一转换逻辑到一个地方

---

## 执行顺序

### Week 1: 文档重构
1. 创建目录结构
2. 移动和重命名文件
3. 创建导航 README
4. 验证链接

### Week 2: 数据模型 Phase 1-2
1. 统一 Side, OrderType
2. 合并 Orderbook 类型
3. 运行 TypeScript 编译验证

### Week 3: 数据模型 Phase 3-4
1. 整理 Trade 类型
2. 设计 Market 类型层次
3. 完整测试

---

## 验证清单

### 文档重构 ✅
- [x] 所有文档都有明确的目标读者
- [x] 没有重复内容
- [x] 导航 README 包含所有文档
- [x] 交叉引用链接都正确

### 数据模型 (Phase 1-2) ✅
- [x] core/types.ts 是 single source of truth (Side, OrderType, Orderbook)
- [x] 没有重复的类型定义 (Phase 1-2 范围内)
- [x] TypeScript 编译通过
- [ ] 所有 examples 正常运行 (待验证)

### 待完成 (Phase 3-4)
- [ ] Trade 类型整理
- [ ] Market 类型整理

---

## 风险与注意事项

1. **Breaking Changes**: 数据模型重构可能影响现有用户
   - 解决: 在 index.ts 保持向后兼容的导出

2. **文档链接失效**: 移动文件后外部链接可能失效
   - 解决: 更新 README 引用，但外部链接无法控制

3. **Market 类型复杂性**: 有 CLOB/Gamma/Merged 三种来源
   - 解决: 保持 UnifiedMarket 作为统一接口，内部处理转换

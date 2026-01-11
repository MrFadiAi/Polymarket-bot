# Polymarket 实现原理

> 理解 Polymarket 的三层架构是正确设计 SDK 的基础

---

## 概述

Polymarket 是一个去中心化预测市场，由三个核心组件构成：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Polymarket 技术栈                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │     CTF     │  │    CLOB     │  │     UMA     │              │
│  │  条件代币   │  │  订单簿交易  │  │  预言机结算  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│        ↓               ↓               ↓                        │
│    代币铸造         价格发现         结果确定                    │
│    代币合并         订单撮合         争议解决                    │
│    代币赎回         链下+链上         48h争议期                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. CTF - Conditional Token Framework

### 1.1 核心概念

CTF 是 Gnosis 开发的条件代币框架，实现了预测市场的代币化：

```
                    1 USDC
                       │
                       ▼
              ┌────────────────┐
              │     SPLIT      │
              │   (铸造代币)    │
              └────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
      1 YES Token              1 NO Token
      (ERC-1155)              (ERC-1155)
```

**核心约束**: `YES + NO = 1 USDC`

这意味着：
- 1 个 YES token + 1 个 NO token 始终等于 1 USDC
- 如果 YES 价格是 0.65，NO 价格必然接近 0.35
- 套利机会存在于 `YES + NO ≠ 1` 时

### 1.2 代币操作

| 操作 | 输入 | 输出 | 说明 |
|------|------|------|------|
| **Split** | 1 USDC | 1 YES + 1 NO | 铸造新代币 |
| **Merge** | 1 YES + 1 NO | 1 USDC | 合并回 USDC |
| **Redeem** | 1 winning token | 1 USDC | 结算后赎回 |

### 1.3 ERC-1155 标准

每个市场的 YES 和 NO 代币都是 ERC-1155 token：

```typescript
// Token ID 格式
interface Token {
  tokenId: string;    // 如 "21742633143463906290569050155826241533067272736897614950488156847949938836455"
  outcome: string;    // "Yes" 或 "No"
  conditionId: string; // 市场标识
}
```

**Token ID 的来源**:
- Gamma API: `clobTokenIds` (JSON 字符串)
- CLOB API: `tokens[].token_id`

### 1.4 SDK 设计启示

```typescript
// 持仓必须包含 outcome 信息
interface Position {
  tokenId: string;
  outcome: 'YES' | 'NO';
  size: number;       // 代币数量
  // ...
}

// 市场必须有两个代币
interface Market {
  yesTokenId: string;
  noTokenId: string;
  // ...
}

// 验证约束
function validatePrices(yesPrice: number, noPrice: number): boolean {
  const sum = yesPrice + noPrice;
  // 允许小误差（价差）
  return sum >= 0.98 && sum <= 1.02;
}
```

---

## 2. CLOB - Central Limit Order Book

### 2.1 混合架构

Polymarket 采用**混合去中心化**架构：

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLOB 混合架构                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │   用户签名   │ --> │  链下撮合   │ --> │  链上结算   │        │
│  │  EIP-712   │     │   Operator  │     │   Polygon   │        │
│  └─────────────┘     └─────────────┘     └─────────────┘        │
│                                                                  │
│  签名内容:                                                       │
│  - 市场 (conditionId)                                           │
│  - 方向 (BUY/SELL)                                              │
│  - 代币 (tokenId)                                               │
│  - 价格和数量                                                    │
│  - 过期时间                                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 订单簿镜像

**关键概念**: 买 YES @ P = 卖 NO @ (1-P)

```
┌─────────────────────────────────────────────────────────────────┐
│                    订单簿镜像特性                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  YES 订单簿                NO 订单簿                             │
│  ┌─────────────┐          ┌─────────────┐                       │
│  │ Bid: 0.55   │  ←──→    │ Ask: 0.45   │  (同一订单!)          │
│  │ Ask: 0.57   │  ←──→    │ Bid: 0.43   │  (同一订单!)          │
│  └─────────────┘          └─────────────┘                       │
│                                                                  │
│  买 YES @ 0.57 = 卖 NO @ 0.43                                   │
│  卖 YES @ 0.55 = 买 NO @ 0.45                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 套利计算

由于镜像特性，套利必须使用**有效价格**：

```typescript
// 错误：直接相加（会重复计算）
const wrongLongCost = yesAsk + noAsk;  // 可能 > 1

// 正确：使用有效价格
interface EffectivePrices {
  effectiveBuyYes: number;   // min(YES.ask, 1 - NO.bid)
  effectiveBuyNo: number;    // min(NO.ask, 1 - YES.bid)
  effectiveSellYes: number;  // max(YES.bid, 1 - NO.ask)
  effectiveSellNo: number;   // max(NO.bid, 1 - YES.ask)
}

function calculateEffectivePrices(yesBook: Orderbook, noBook: Orderbook): EffectivePrices {
  const yesBid = yesBook.bids[0]?.price || 0;
  const yesAsk = yesBook.asks[0]?.price || 1;
  const noBid = noBook.bids[0]?.price || 0;
  const noAsk = noBook.asks[0]?.price || 1;

  return {
    effectiveBuyYes: Math.min(yesAsk, 1 - noBid),
    effectiveBuyNo: Math.min(noAsk, 1 - yesBid),
    effectiveSellYes: Math.max(yesBid, 1 - noAsk),
    effectiveSellNo: Math.max(noBid, 1 - yesAsk),
  };
}

// Long arb: 同时买 YES + NO，期望 settlement 获利
const longCost = effectiveBuyYes + effectiveBuyNo;
const longProfit = 1 - longCost;  // > 0 表示有套利机会

// Short arb: 同时卖 YES + NO
const shortRevenue = effectiveSellYes + effectiveSellNo;
const shortProfit = shortRevenue - 1;  // > 0 表示有套利机会
```

### 2.4 交易参数

```typescript
interface TradingParams {
  minimumOrderSize: number;    // 最小订单量 (5 或 15 USDC)
  minimumTickSize: number;     // 最小价格单位 (0.001 或 0.01)
  makerBaseFee: number;        // Maker 费率
  takerBaseFee: number;        // Taker 费率
  secondsDelay: number;        // 体育赛事延迟
}
```

---

## 3. UMA - Optimistic Oracle

### 3.1 结算流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    UMA 结算流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  事件发生 → 提交结果 → 48h 争议期 → 结算                         │
│     │          │           │         │                          │
│     │          ▼           ▼         ▼                          │
│     │     质押 UMA     无争议?    YES=1, NO=0                   │
│     │     提交答案     有争议?    或 YES=0, NO=1                 │
│     │                  DVM 投票                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 结算结果

市场结算后，代币价值变为：
- **YES wins**: YES = 1 USDC, NO = 0
- **NO wins**: YES = 0, NO = 1 USDC
- **50-50**: YES = 0.5 USDC, NO = 0.5 USDC (罕见)

### 3.3 相关字段

```typescript
interface SettlementInfo {
  umaResolutionStatus: 'proposed' | 'disputed' | 'resolved';
  umaEndDate: string;           // 结算时间
  umaBond: string;              // 质押金额
  umaReward: string;            // 奖励金额
  resolvedBy?: string;          // 结算者地址
}
```

---

## 4. Neg-Risk 市场

### 4.1 概念

Neg-Risk 市场是多选题市场（如 "谁将赢得总统选举？"）：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Neg-Risk 市场示例                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  问题: 谁将赢得 2024 总统选举？                                  │
│                                                                  │
│  选项:                                                          │
│  ├── Trump  → 单独市场 A (conditionId: 0xdd22...)               │
│  ├── Biden  → 单独市场 B (conditionId: 0xab12...)               │
│  ├── Harris → 单独市场 C (conditionId: 0xcd34...)               │
│  └── Other  → 单独市场 D (conditionId: 0xef56...)               │
│                                                                  │
│  Neg-Risk 标识:                                                 │
│  - negRisk: true                                                │
│  - negRiskMarketID: 0xe3b1bc38... (共同标识)                    │
│  - questionID: 0xe3b1bc38... (Gamma 中)                         │
│                                                                  │
│  约束: 所有选项 YES 价格之和 ≈ 1                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 SDK 设计

```typescript
interface Market {
  // 普通市场
  conditionId: string;

  // Neg-Risk 额外字段
  negRisk?: boolean;
  negRiskMarketId?: string;   // 共同的 questionID
  groupItemTitle?: string;    // 如 "Trump", "Biden"
}

// 查询同一 neg-risk 组的所有市场
async function getNegRiskGroup(questionId: string): Promise<Market[]> {
  const markets = await gamma.getMarkets({ negRiskMarketId: questionId });
  return markets;
}
```

---

## 5. 原理约束对 SDK 的影响

### 5.1 类型设计

```typescript
// 1. Token 必须关联 market 和 outcome
interface Token {
  tokenId: string;
  conditionId: string;   // 关联市场
  outcome: 'YES' | 'NO'; // CTF 原理
}

// 2. 持仓必须有成本基础（用于 PnL 计算）
interface Position {
  token: Token;
  size: number;
  avgPrice: number;      // 平均成本
  unrealizedPnl: number; // 基于当前价格
}

// 3. 市场必须有双边代币
interface Market {
  conditionId: string;
  yesToken: Token;
  noToken: Token;
  // 价格约束: yesPrice + noPrice ≈ 1
}
```

### 5.2 计算函数

```typescript
// PnL 计算
function calculateUnrealizedPnl(position: Position, currentPrice: number): number {
  const value = position.size * currentPrice;
  const cost = position.size * position.avgPrice;
  return value - cost;
}

// 赎回价值（结算后）
function calculateRedeemValue(position: Position, winner: 'YES' | 'NO'): number {
  if (position.token.outcome === winner) {
    return position.size * 1.0;  // 获胜方 = 1 USDC per token
  }
  return 0;  // 失败方 = 0
}

// 套利检测
function detectArbitrage(yesBook: Orderbook, noBook: Orderbook): {
  hasLongArb: boolean;
  hasShortArb: boolean;
  profit: number;
} {
  const effective = calculateEffectivePrices(yesBook, noBook);
  const longCost = effective.effectiveBuyYes + effective.effectiveBuyNo;
  const shortRevenue = effective.effectiveSellYes + effective.effectiveSellNo;

  return {
    hasLongArb: longCost < 1,
    hasShortArb: shortRevenue > 1,
    profit: Math.max(1 - longCost, shortRevenue - 1),
  };
}
```

---

## 6. 总结

### 6.1 核心约束

| 原理 | 约束 | SDK 影响 |
|------|------|---------|
| CTF | YES + NO = 1 | 市场必须有双边代币 |
| CLOB | 订单簿镜像 | 套利需用有效价格 |
| UMA | 结算 0 或 1 | 持仓有 redeemable 状态 |
| Neg-Risk | 多选之和 = 1 | 需关联 questionID |

### 6.2 设计检查清单

- [ ] 类型是否反映 CTF 的 YES/NO 二元结构？
- [ ] 套利计算是否使用有效价格？
- [ ] 持仓是否包含成本基础？
- [ ] 市场是否正确处理 neg-risk？
- [ ] 结算状态是否正确映射？

---

## 参考资料

- [Polymarket Docs](https://docs.polymarket.com/)
- [Gnosis CTF](https://docs.gnosis.io/conditionaltokens/)
- [UMA Protocol](https://umaproject.org/)

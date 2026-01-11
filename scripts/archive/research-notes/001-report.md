# Hybrid Strategy Live Test Report

**Date**: 2025-12-22
**Session ID**: strategy-mjfs0gn2-x1g674
**Strategy**: Test Hybrid Strategy - 10 USDC
**Market**: NVIDIA largest company by market cap on Dec 31
**Condition ID**: 0x0b16eb7741855ca3d4...
**Market Type**: Neg Risk

---

## 1. Executive Summary

Hybrid 策略在 Live 模式下运行了 3.5+ 小时，发现多个严重问题：

| 指标 | 值 | 状态 |
|------|-----|------|
| 运行时间 | 3h 25m+ | - |
| 初始 USDC | $343.80 | - |
| 最终 USDC | $3.98 | ❌ 几乎耗尽 |
| YES Tokens | 362.31 | 持续增加 |
| NO Tokens | 344.99 | 持续增加 |
| 成功订单数 | 120+ | 仅 BUY 订单 |
| 成交交易数 | 0 | ❌ 无任何成交 |
| PnL | $0.00 | 无交易收益 |

**核心问题**: 策略只能执行 BUY 和 Split，无法执行 SELL 和 Merge，导致 USDC 单向消耗。

---

## 2. 发现的问题

### 2.1 SELL 订单全部失败 (Critical)

**现象**:
```
[CLOB Client] request error {
  "error": "not enough balance / allowance"
}
```

**订单类型影响**:

| 订单类型 | 状态 | 原因 |
|---------|------|------|
| BUY YES | ✅ 成功 | USDC ERC20 allowance 正常 |
| BUY NO | ✅ 成功 | USDC ERC20 allowance 正常 |
| SELL YES | ❌ 失败 | Neg Risk 市场 ERC1155 授权问题 |
| SELL NO | ❌ 失败 | Neg Risk 市场 ERC1155 授权问题 |

**钱包实际状态**:
- YES Balance: 362.31 tokens (足够)
- NO Balance: 344.99 tokens (足够)
- ERC1155 Approval: ✅ 已设置 (CTF Exchange, Neg Risk CTF Exchange)

**推测原因**:
Neg Risk 市场的 YES/NO tokens 通过 Neg Risk Adapter 包装，可能需要额外的授权机制。

### 2.2 Rebalance 机制过于激进 (High)

**现象**:
- 每次 Market Update 都触发 `rebalance` signal
- 持续执行 `split` 或 `merge` 动作
- USDC 从 $343 耗尽至 $4

**日志证据**:
```
[SessionRunner] Generated 1 signals: rebalance
[SessionRunner] Executing 1 actions: split
[SessionRunner] Generated 1 signals: rebalance
[SessionRunner] Executing 1 actions: split
...
(持续数百次)
```

**参数分析**:
```typescript
arbParams: {
  usdcRatio: 0.5,           // 目标 50% USDC
  rebalanceThreshold: 0.15, // 偏离 15% 时触发
  minSize: 1,               // 最小交易量
}
```

**问题**:
1. Split 后 USDC 比例立即偏离目标
2. 触发新的 rebalance → 继续 split
3. 形成正反馈循环直到 USDC 耗尽

### 2.3 MM 订单无法成交 (High)

**现象**:
- 120+ 订单显示为 "open"
- 0 trades (无任何成交)
- 订单一直挂单未被吃

**市场状态**:
```
YES: bid=0.956 ask=0.957 (spread=0.1%)
```

**MM 订单价格**:
```
SELL YES @ 0.917-0.947 (低于市场 bid 0.956)
BUY NO @ 0.107-0.128 (高于市场 ask ~0.043)
```

**问题分析**:
1. SELL YES 订单 **低于** 市场 bid，理论上应该立即成交
2. 但因为 SELL 订单失败 (2.1)，这些订单实际未提交
3. 前端显示的 "open" 订单只是 BUY 订单
4. BUY 订单定价在 bid 下方，需要市场下跌才能成交

### 2.4 Merge 操作可能失败 (Medium)

**现象**:
- 策略后期开始执行 `merge` 动作
- 但余额变化显示 merge 未生效
- USDC 持续减少，tokens 持续增加

**证据**:
```
[SessionRunner] Executing 1 actions: merge
[BalanceSync] Balance updated: USDC=5.09, YES=362.31, NO=319.99
[BalanceSync] Balance updated: USDC=4.86, YES=362.31, NO=324.99
(USDC 减少, NO 增加 - 与 merge 预期相反)
```

### 2.5 前端显示不准确 (Medium)

**问题**:
1. 失败的订单没有显示为 "failed"
2. 所有订单都显示为 "open"
3. 无法区分成功和失败的订单

---

## 3. Hybrid 策略参数分析

### 3.1 当前配置

```typescript
// MM 参数
mmParams: {
  pricingMode: 'undercut',      // 压价模式
  minSpread: 0.02,              // 2% 最小价差
  orderSize: 5,                 // 每笔 5 份
  updateInterval: 5000,         // 5秒更新
  useMint: true,                // 使用 Split/Merge
  inventoryConfig: {
    maxPosition: 50,
    skewMultiplier: 0.001
  },
  riskConfig: {
    priceChangeThreshold: 0.05,
    maxLossThreshold: 20
  }
}

// Arb 参数
arbParams: {
  minProfitRate: 0.01,          // 1% 最小利润率
  minProfitAmount: 0.5,         // $0.5 最小利润
  minSize: 1,
  maxSingleTrade: 50,
  useSmartSizing: true,
  sizeBuffer: 0.9,
  usdcRatio: 0.5,               // 50% USDC 目标
  rebalanceThreshold: 0.15      // 15% 触发阈值
}

// 互斥配置
mutualExclusion: {
  arbPriority: 90,
  rebalancePriority: 30,
  pauseThreshold: 80,
  cooldownMs: 5000,
  cancelMMOnArb: true
}
```

### 3.2 参数问题

| 参数 | 当前值 | 问题 | 建议 |
|------|--------|------|------|
| `minSpread` | 2% | 市场 spread 只有 0.1%，订单太远 | 降低到 0.5% |
| `rebalanceThreshold` | 15% | 太敏感，频繁触发 | 提高到 30% |
| `useMint` | true | 导致无限 split/merge | 添加冷却时间 |
| `usdcRatio` | 50% | Split 后立即偏离 | 考虑动态调整 |

---

## 4. 市场适配性分析

### 4.1 NVIDIA 市场特点

| 指标 | 值 | 影响 |
|------|-----|------|
| YES 价格 | ~$0.956 | 高度偏向一方 |
| NO 价格 | ~$0.044 | - |
| Spread | 0.1% | 太窄，难以做市 |
| 市场类型 | Neg Risk | 需要特殊授权 |
| 套利空间 | YES+NO=1.00 | 无套利机会 |

### 4.2 市场做市可行性

**结论**: 该市场**不适合**做市

**原因**:
1. **单边市场**: 95/5 的价格分布，流动性集中在 YES
2. **Spread 太窄**: 0.1% 无法覆盖手续费
3. **Neg Risk 限制**: SELL 订单无法执行
4. **无套利空间**: YES + NO = 1.00，无价差

---

## 5. 解决方案建议

### 5.1 紧急修复 (P0)

1. **修复 Neg Risk SELL 订单授权**
   - 调查 Neg Risk Adapter 的 ERC1155 授权要求
   - 可能需要对 Neg Risk Adapter 设置 setApprovalForAll
   - 或者需要通过 Neg Risk Adapter 执行 SELL

2. **添加 Rebalance 冷却时间**
   ```typescript
   // 建议添加
   rebalanceCooldownMs: 60000  // 1分钟冷却
   lastRebalanceTime: number
   ```

### 5.2 策略改进 (P1)

1. **动态 Spread 调整**
   - 根据市场 spread 自动调整 minSpread
   - 如果市场 spread < minSpread，降低订单量或暂停

2. **市场筛选**
   - 不在极端偏向的市场 (>90% 或 <10%) 做市
   - 优先选择 spread > 1% 的市场

3. **Rebalance 逻辑优化**
   - 增加阈值，减少频率
   - 考虑交易成本
   - 添加最大 rebalance 次数限制

### 5.3 监控改进 (P2)

1. **订单状态准确显示**
   - 区分成功/失败订单
   - 显示失败原因

2. **实时警告**
   - USDC 低于阈值时警告
   - 订单失败率过高时警告

---

## 6. 技术细节

### 6.1 Polymarket 合约授权要求

```
ERC20 授权 (USDC.e → 合约):
✅ CTF Exchange              - 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
✅ Neg Risk CTF Exchange     - 0xC5d563A36AE78145C45a50134d48A1215220f80a
✅ Neg Risk Adapter          - 0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296
✅ Conditional Tokens        - 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045

ERC1155 授权 (Conditional Tokens → 合约):
✅ CTF Exchange
✅ Neg Risk CTF Exchange
❓ Neg Risk Adapter          - 可能需要额外授权
```

### 6.2 订单流程

```
策略生成 Signal
    ↓
Signal → Action (place_order)
    ↓
ActionExecutor 调用 TradingClient
    ↓
TradingClient.createOrder()
    ↓
签名订单并发送到 CLOB API
    ↓
CLOB 验证 balance + allowance
    ↓
❌ SELL 订单失败 (Neg Risk 授权问题)
✅ BUY 订单成功
```

---

## 7. 下一步行动

- [ ] 调查 Neg Risk Adapter ERC1155 授权需求
- [ ] 修复 SELL 订单授权问题
- [ ] 添加 Rebalance 冷却机制
- [ ] 优化市场选择逻辑
- [ ] 改进前端订单状态显示
- [ ] 选择更适合做市的市场进行测试

---

## 8. 问题修复记录

### 8.1 Neg Risk Adapter ERC1155 授权 (已修复)

**发现时间**: 2025-12-22 01:15

**问题**: Neg Risk Adapter 缺少 ERC1155 授权

**检查结果**:
```
CTF Exchange: ✅ Approved
Neg Risk CTF Exchange: ✅ Approved
Neg Risk Adapter: ❌ Not Approved  ← 这是问题根源！
```

**修复**:
```bash
npx tsx scripts/approve-neg-risk-erc1155.ts
```

**交易详情**:
- TX Hash: `0x1fcb671978b300266b04e305432b81b76a9c3f499cdfeb4798009c5ce7708f4e`
- Block: 80609070
- Gas Price: 70.86 Gwei

**验证结果**:
```
CTF Exchange: ✅ Approved
Neg Risk CTF Exchange: ✅ Approved
Neg Risk Adapter: ✅ Approved  ← 已修复
```

**验证修复有效**:
授权后，第一个 SELL YES 订单成功：
```
[strategy-mjfs0gn2-x1g674] Order created: ord-1766337345591-121 SELL YES 10@0.952677827 [mm]
[SessionRunner] Live order placed: ord-1766337345591-121 -> Polymarket 0x8a1ccb...
```

前端显示订单数从 120 → 121，确认 SELL 订单成功提交。

**结论**:
对于 Neg Risk 市场，需要同时设置：
1. ERC20 授权 (USDC.e → 4个合约)
2. ERC1155 授权 (Conditional Tokens → **3个合约，包括 Neg Risk Adapter**)

---

## 9. 相关文件

| 文件 | 用途 |
|------|------|
| `scripts/truth.md` | Polymarket 下单真相文档 |
| `scripts/check-all-allowances.ts` | 检查 ERC20 授权 |
| `scripts/approve-erc1155.ts` | 设置 ERC1155 授权 |
| `scripts/test-order.ts` | 测试下单功能 |

---

## 10. 修复实施记录 (2025-12-22)

### 10.1 回收 NVIDIA 仓位资金 ✅

**执行时间**: 2025-12-22

**操作**:
- 创建脚本 `scripts/sell-nvidia-positions.ts`
- 卖出 352.31 YES tokens (@ bid $0.956)
- 卖出 344.99 NO tokens (@ bid $0.044)

**结果**:
```
初始 USDC: $13.78
回收 YES: ~$337
回收 NO: ~$15
最终 USDC: $364.74
净回收: +$350.96
```

### 10.2 前端订单状态显示改进 ✅

**修改文件**: `packages/earning-engine/dashboard-web/src/app/live/[id]/page.tsx`

**改进内容**:

1. **LOW 余额警告**
   - 当 USDC < $10 时显示红色边框和 "LOW" 标签
   - 带动画效果，提醒用户注意

2. **订单统计函数**
   ```typescript
   function computeOrderStats(orders: OrderRecord[]) {
     const total = orders.length;
     const filled = orders.filter(o => o.status === 'filled').length;
     const failed = orders.filter(o => o.status === 'failed' || o.status === 'rejected').length;
     const failureRate = total > 0 ? (failed / total) * 100 : 0;
     return { total, filled, open, failed, cancelled, buyOrders, sellOrders, failureRate };
   }
   ```

3. **失败率警告**
   - 失败率 > 20% 时显示红色警告横幅
   - 显示具体失败率和建议检查授权

4. **订单状态颜色**
   - `filled`: 绿色 (text-profit)
   - `open`: 青色 (text-cyan-500)
   - `cancelled`: 琥珀色 (text-amber-500)
   - `failed/rejected`: 红色 (text-loss)

### 10.3 Rebalance 冷却机制 ✅

**修改文件**:
- `packages/earning-engine/strategies/src/arb/types.ts`
- `packages/earning-engine/strategies/src/arb/rebalancer.ts`
- `packages/earning-engine/strategies/src/arb/index.ts`

**新增配置**:
```typescript
// types.ts
rebalanceCooldownMs?: number;        // 冷却时间 (默认 60000ms)
maxConsecutiveRebalances?: number;   // 最大连续次数 (默认 3)

interface RebalanceState {
  lastRebalanceTime: number;
  consecutiveCount: number;
}
```

**新增函数**:
```typescript
// rebalancer.ts
createRebalanceState()           // 创建初始状态
isInCooldown(state, config)      // 检查是否在冷却期
updateRebalanceState(state)      // 更新状态 (rebalance 后调用)
resetRebalanceCount(state)       // 重置连续计数
```

**机制说明**:
- 每次 rebalance 后进入 60 秒冷却期
- 连续 rebalance 3 次后，强制 3x 冷却 (180秒)
- 有其他操作打断时重置计数

### 10.4 下一步市场选择 ✅

**执行**: 运行 `examples/research-markets.ts` 进行市场研究

**推荐候选市场**:

| 类型 | 市场 | 价格 | Spread | 深度 |
|------|------|------|--------|------|
| MM | No change in Fed interest rates after January 2026 | 91% | 1% | $198K |
| Hybrid | Lighter market cap (FDV) >$3B one day after launch | 51.5% | 1% | - |

**选择建议**:
- "Lighter market cap >$3B" 更适合 Hybrid 策略
- 价格 51.5% 接近 50/50，双边流动性好
- 1% spread 有足够的做市空间

---

## 11. 下一步行动 (更新)

- [x] ~~调查 Neg Risk Adapter ERC1155 授权需求~~ ✅ 8.1
- [x] ~~修复 SELL 订单授权问题~~ ✅ 8.1
- [x] ~~添加 Rebalance 冷却机制~~ ✅ 10.3
- [x] ~~改进前端订单状态显示~~ ✅ 10.2
- [x] ~~回收 NVIDIA 仓位资金~~ ✅ 10.1
- [x] ~~选择更适合做市的市场~~ ✅ 10.4
- [ ] 在新市场启动 Hybrid 策略测试
- [ ] 验证 Rebalance 冷却机制效果
- [ ] 收集新市场运行数据

---

**报告生成时间**: 2025-12-22 01:10 (UTC+8)
**报告更新时间**: 2025-12-22 (修复实施)
**报告作者**: Claude (AI Assistant)

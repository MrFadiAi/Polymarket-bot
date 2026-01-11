# DipArb Strategy (暴跌套利策略)

## 概述

DipArb 是一个针对 Polymarket 15 分钟 UP/DOWN 市场的**结构性套利策略**，利用预测市场的规则约束和情绪波动来捕捉无风险利润。

**核心原理**: 在预测市场中，UP + DOWN 的结算总和 = $1。如果能用总成本 < $1 买入 UP + DOWN 双方，则锁定正利润。

---

## 市场结构

### Polymarket 15 分钟 UP/DOWN 市场规则

| 参数 | 说明 |
|------|------|
| 支持币种 | BTC, ETH, SOL, XRP |
| 时长 | 5 分钟 / 15 分钟 |
| Price to Beat | 轮次开始时的 Chainlink 价格 |
| UP 赢条件 | 结束时价格 >= Price to Beat |
| DOWN 赢条件 | 结束时价格 < Price to Beat |
| Token 总和 | UP + DOWN = $1（结算时） |

### 为什么套利可行

1. **结构性约束**: UP + DOWN = $1，这是市场规则，不是假设
2. **短周期流动性薄**: 15 分钟市场刚开盘时，流动性不足，价格发现不充分
3. **情绪化交易者**: 突发价格跳动引发恐慌性抛售
4. **非理性定价**: 不是所有人都在算 "UP + DOWN = 1"

---

## 策略流程

### Phase 1: 轮次开始 (New Round)

```
轮次开始
    ↓
记录开盘价 (upOpen, downOpen)
    ↓
监控 Orderbook 变化
```

- 记录 UP 和 DOWN 的开盘 best ask 价格
- 这些价格作为后续跌幅计算的基准

### Phase 2: Leg1 - 捕捉暴跌信号

**关键逻辑**: 在 **~3 秒** 的滑动窗口内，检测是否发生 **≥15% 的瞬时暴跌**

```typescript
// 正确的信号检测逻辑
const price3sAgo = priceHistory.getPriceAt(now - 3000);  // 3秒前的价格
const currentPrice = orderbook.bestAsk;

// 计算 3 秒内的瞬时跌幅
const instantDrop = (price3sAgo - currentPrice) / price3sAgo;

if (instantDrop >= 0.15) {  // 15% 瞬时暴跌
  // 触发 Leg1 信号
  emit('signal', { type: 'leg1', side: 'UP', ... });
}
```

**为什么是 3 秒？**

| 窗口时长 | 含义 | 适用场景 |
|---------|------|---------|
| 3 秒跌 1% | 正常波动/噪音 | ❌ 不触发 |
| 3 秒跌 15% | 异常事件/恐慌抛售 | ✅ 触发 |
| 5 分钟跌 15% | 趋势下行 | ❌ 不触发 |

**重点**: 我们捕捉的是**情绪/订单簿失衡**，不是趋势。

### Phase 3: Leg1 执行

```
检测到暴跌信号
    ↓
计算目标价格 (targetPrice = currentPrice * 1.02)
    ↓
买入被砸的一侧 (e.g., UP)
    ↓
phase = 'leg1_filled'
```

### Phase 4: Leg2 - 构建对冲

等待对侧价格满足条件：

```typescript
const leg1Price = 0.35;  // Leg1 买入价
const oppositeAsk = 0.58;  // 对侧 best ask

const totalCost = leg1Price + oppositeAsk;  // 0.93

if (totalCost <= sumTarget) {  // sumTarget = 0.95
  // 触发 Leg2 信号
  emit('signal', { type: 'leg2', side: 'DOWN', ... });
}
```

### Phase 5: 结算

```
双持仓完成 (UP + DOWN)
    ↓
等待市场结算
    ↓
无论 UP 还是 DOWN 赢，回报 = $1
    ↓
利润 = $1 - totalCost
```

---

## 配置参数

```typescript
interface DipArbServiceConfig {
  // 交易参数
  shares: number;              // 每次交易的 shares 数量 (默认: 20)
  sumTarget: number;           // UP+DOWN 目标总成本 (默认: 0.95)
  minProfitRate: number;       // 最小利润率要求 (默认: 0.03 = 3%)
  maxSlippage: number;         // 最大滑点容忍 (默认: 0.02 = 2%)

  // 信号检测参数
  dipThreshold: number;        // 跌幅阈值 (默认: 0.15 = 15%)
  slidingWindowMs: number;     // 滑动窗口毫秒 (默认: 3000 = 3秒) ⚠️ 关键参数
  windowMinutes: number;       // 轮次开始后的交易窗口 (默认: 2分钟)

  // 执行参数
  autoExecute: boolean;        // 自动执行交易 (默认: false)
  leg2TimeoutSeconds: number;  // Leg2 等待超时 (默认: 300秒)

  // 附加功能
  enableSurge: boolean;        // 启用暴涨检测 (默认: true)
  surgeThreshold: number;      // 暴涨阈值 (默认: 0.15)
  autoMerge: boolean;          // 自动 merge (默认: true)
}
```

### 参数选择的生死攸关性

| 参数组合 | 结果 |
|---------|------|
| dipThreshold=1%, window=任意 | ❌ 负 ROI (噪音太多) |
| dipThreshold=15%, window=3s | ✅ 高 ROI (真正的异常) |
| dipThreshold=15%, window=5min | ❌ 会当作趋势交易 |

---

## 回测结论

基于历史数据回测：

```
稳健参数:
- dipThreshold: 15%
- slidingWindowMs: 3000 (3秒)
- sumTarget: 0.95
- windowMinutes: 2

结果:
- 低频但高确定性
- 正期望
```

---

## 风险控制

### 内置风险控制

1. **同一轮只触发一次**: 防止反复追刀
2. **窗口限制**: 只在轮次开始后 2 分钟内交易
3. **利润率验证**: estimatedProfitRate >= minProfitRate
4. **执行冷却**: executionCooldown 防止连续下单
5. **Leg2 超时**: 未完成对冲则标记为 expired

### 未完成对冲的处理

如果在完成两腿前市场结束：

```typescript
// 策略选择：放弃未完成的循环
// 按最坏情况处理：单侧持仓可能全亏
if (phase === 'leg1_filled' && marketEnded) {
  stats.roundsExpired++;
  // 最坏亏损 = leg1Shares * leg1Price
}
```

---

## 使用示例

```typescript
import { PolymarketSDK } from '@catalyst-team/poly-sdk';

const sdk = new PolymarketSDK({
  privateKey: process.env.PRIVATE_KEY,
});

// 配置参数
sdk.dipArb.updateConfig({
  shares: 20,
  sumTarget: 0.95,
  dipThreshold: 0.15,      // 15% 跌幅
  slidingWindowMs: 3000,   // 3 秒窗口 ⚠️ 关键
  windowMinutes: 2,
  autoExecute: true,       // 启用自动交易
});

// 监听事件
sdk.dipArb.on('signal', (signal) => {
  if (signal.type === 'leg1') {
    console.log(`Leg1 Signal: ${signal.dipSide} dropped ${(signal.dropPercent * 100).toFixed(1)}% in 3s`);
  }
});

sdk.dipArb.on('execution', (result) => {
  console.log(`Executed: ${result.leg} ${result.success ? '✓' : '✗'}`);
});

sdk.dipArb.on('roundComplete', (result) => {
  console.log(`Round profit: $${result.profit?.toFixed(2)}`);
});

// 启动
await sdk.dipArb.findAndStart({
  coin: 'ETH',
  preferDuration: '15m',
});

// 启用自动轮转
sdk.dipArb.enableAutoRotate({
  underlyings: ['ETH', 'BTC', 'SOL', 'XRP'],
  preferDuration: '15m',
  settleStrategy: 'sell',
});
```

---

## 与传统套利的区别

| 方面 | DipArb | AMM/CEX 套利 |
|------|--------|-------------|
| 依赖 | 市场规则约束 | 跨市场价差 |
| 信号 | 情绪性暴跌 | 价格偏离 |
| 频率 | 低频 | 高频 |
| 确定性 | 高 | 中 |
| 资本需求 | 低 | 高 |

---

## 总结

DipArb 的核心优势在于：

1. **结构性**: 利用 UP + DOWN = $1 的市场规则
2. **情绪性**: 捕捉 3 秒内的恐慌性抛售
3. **确定性**: 双持仓锁定利润

关键参数：

- `slidingWindowMs = 3000` (3 秒)
- `dipThreshold = 0.15` (15%)
- `sumTarget = 0.95`

**判断标准**: 如果想放宽参数加速交易，大概率是把套利变成赌博。

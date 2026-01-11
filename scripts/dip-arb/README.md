# DipArb Scripts

DipArb (暴跌套利) 策略脚本，用于 Polymarket 15 分钟 UP/DOWN 市场。

## 支持的币种

| 币种 | 跌幅阈值 | 检测窗口 | 目标成本 | 预期利润 |
|------|---------|---------|---------|---------|
| **BTC** | 20% | 5秒 | 0.95 | ≥5.3% |
| **ETH** | 30% | 5秒 | 0.93 | ≥7.5% |
| **SOL** | 40% | 3秒 | 0.85 | ≥17.6% |
| **XRP** | 40% | 3秒 | 0.85 | ≥17.6% |

> BTC 波动小，需要更宽松的阈值；XRP/SOL 波动大，使用更激进的参数。

## 快速开始

```bash
# 设置私钥
export PRIVATE_KEY=0x...

# 运行不同币种
npx tsx scripts/dip-arb/auto-trade.ts --eth
npx tsx scripts/dip-arb/auto-trade.ts --btc
npx tsx scripts/dip-arb/auto-trade.ts --sol
npx tsx scripts/dip-arb/auto-trade.ts --xrp

# 自定义参数
npx tsx scripts/dip-arb/auto-trade.ts --xrp --dip=0.35 --target=0.90 --shares=50
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--btc`, `-b` | 交易 BTC 市场 | - |
| `--eth`, `-e` | 交易 ETH 市场 | ✓ (默认) |
| `--sol`, `-s` | 交易 SOL 市场 | - |
| `--xrp`, `-x` | 交易 XRP 市场 | - |
| `--dip=X` | 跌幅阈值 (0.30 = 30%) | 币种默认 |
| `--window=X` | 检测窗口 (毫秒) | 币种默认 |
| `--timeout=X` | Leg2 止损时间 (秒) | 60 |
| `--target=X` | 目标总成本 | 币种默认 |
| `--shares=X` | 每次交易份数 | 25 |

## 日志

每个市场单独生成日志文件：

```
/tmp/dip-arb-logs/
├── 2026-01-07_100500_eth-updown-15m-1767780000.log
├── 2026-01-07_101500_eth-updown-15m-1767780900.log
└── ...
```

## 策略原理

### 核心逻辑

```
套利的本质：如果买入 UP + DOWN 的总成本 < $1，则无论结果如何都有利润

利润 = $1 - 总成本
利润率 = (1 - 总成本) / 总成本

例：UP @ 0.42 + DOWN @ 0.52 = 0.94 总成本
    利润 = $1 - $0.94 = $0.06 (6.38%)
```

### 两腿策略 (Leg1 + Leg2)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DipArb 两腿策略                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  正常状态:  UP = 0.50    DOWN = 0.50    Sum = 1.00 (无套利空间)          │
│                                                                         │
│  ══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  情绪性暴跌发生 (3-5秒内):                                               │
│                                                                         │
│  UP: 0.50 → 0.35 (-30%)  ← 触发 Leg1 信号!                              │
│                                                                         │
│  Leg1: 买入 UP @ 0.35 (抄底暴跌侧)                                       │
│                                                                         │
│  等待对侧满足条件...                                                     │
│                                                                         │
│  检查: 0.35 + DOWN_ask <= 0.93 (sumTarget)                              │
│        DOWN_ask = 0.57 → 0.35 + 0.57 = 0.92 ✅                          │
│                                                                         │
│  Leg2: 买入 DOWN @ 0.57                                                 │
│                                                                         │
│  ══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  持仓: 25x UP + 25x DOWN = $23.00 成本                                  │
│  结算: 25 × $1.00 = $25.00                                              │
│  利润: $2.00 (8.7%)                                                     │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### 止损机制

如果 Leg1 买入后，Leg2 条件在 60 秒内未满足：

```
Leg1 @ 0.35 买入 UP
  ↓
等待 60 秒...
  ↓
Leg2 条件未满足 (DOWN 价格太高)
  ↓
止损: 卖出 UP @ 当前价格
```

## 自动轮换 & 赎回

脚本支持连续运行多个市场周期：

1. **预加载**: 市场结束前 2 分钟预加载下一个市场
2. **自动切换**: 市场结束后无缝切换
3. **自动赎回**: 市场结算后 5 分钟自动赎回获胜仓位

```typescript
enableAutoRotate({
  enabled: true,
  underlyings: ['XRP'],
  duration: '15m',
  settleStrategy: 'redeem',      // 等待结算后赎回
  autoSettle: true,
  preloadMinutes: 2,
  redeemWaitMinutes: 5,          // 结束后等 5 分钟
  redeemRetryIntervalSeconds: 30  // 每 30 秒检查
});
```

## PM2 部署 (GCP 服务器)

```bash
# ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'xrp-dip',
      script: 'npx',
      args: 'tsx scripts/dip-arb/auto-trade.ts --xrp',
      cwd: '~/poly-sdk',
      env: { PRIVATE_KEY: '0x...' }
    },
    {
      name: 'eth-dip',
      script: 'npx',
      args: 'tsx scripts/dip-arb/auto-trade.ts --eth',
      cwd: '~/poly-sdk',
      env: { PRIVATE_KEY: '0x...' }
    }
  ]
};

# 启动
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 参数对照表

| sumTarget | 最小利润率 | 风险等级 |
|-----------|-----------|---------|
| 0.85 | 17.6% | 激进，机会少 |
| 0.90 | 11.1% | 较激进 |
| 0.93 | 7.5% | 平衡 (ETH 推荐) |
| 0.95 | 5.3% | 保守 (BTC 推荐) |
| 0.98 | 2.0% | 极保守 |

---

# DipArb Scripts (English)

DipArb (Dip Arbitrage) strategy scripts for Polymarket 15-minute UP/DOWN markets.

## Supported Coins

| Coin | Dip Threshold | Detection Window | Target Cost | Expected Profit |
|------|--------------|------------------|-------------|-----------------|
| **BTC** | 20% | 5s | 0.95 | ≥5.3% |
| **ETH** | 30% | 5s | 0.93 | ≥7.5% |
| **SOL** | 40% | 3s | 0.85 | ≥17.6% |
| **XRP** | 40% | 3s | 0.85 | ≥17.6% |

> BTC has lower volatility, requiring looser thresholds; XRP/SOL are more volatile, using aggressive parameters.

## Quick Start

```bash
# Set private key
export PRIVATE_KEY=0x...

# Run different coins
npx tsx scripts/dip-arb/auto-trade.ts --eth
npx tsx scripts/dip-arb/auto-trade.ts --btc
npx tsx scripts/dip-arb/auto-trade.ts --sol
npx tsx scripts/dip-arb/auto-trade.ts --xrp

# Custom parameters
npx tsx scripts/dip-arb/auto-trade.ts --xrp --dip=0.35 --target=0.90 --shares=50
```

## CLI Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `--btc`, `-b` | Trade BTC markets | - |
| `--eth`, `-e` | Trade ETH markets | ✓ (default) |
| `--sol`, `-s` | Trade SOL markets | - |
| `--xrp`, `-x` | Trade XRP markets | - |
| `--dip=X` | Dip threshold (0.30 = 30%) | Coin default |
| `--window=X` | Detection window (ms) | Coin default |
| `--timeout=X` | Leg2 stop-loss time (seconds) | 60 |
| `--target=X` | Target total cost | Coin default |
| `--shares=X` | Shares per trade | 25 |

## Logging

Each market generates a separate log file:

```
/tmp/dip-arb-logs/
├── 2026-01-07_100500_eth-updown-15m-1767780000.log
├── 2026-01-07_101500_eth-updown-15m-1767780900.log
└── ...
```

## Strategy Logic

### Core Concept

```
Arbitrage essence: If total cost of UP + DOWN < $1, profit is guaranteed

Profit = $1 - Total Cost
Profit Rate = (1 - Total Cost) / Total Cost

Example: UP @ 0.42 + DOWN @ 0.52 = 0.94 total cost
         Profit = $1 - $0.94 = $0.06 (6.38%)
```

### Two-Leg Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                     DipArb Two-Leg Strategy                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Normal State:  UP = 0.50    DOWN = 0.50    Sum = 1.00 (no arb)        │
│                                                                         │
│  ══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  Flash crash detected (within 3-5 seconds):                            │
│                                                                         │
│  UP: 0.50 → 0.35 (-30%)  ← Leg1 Signal Triggered!                      │
│                                                                         │
│  Leg1: Buy UP @ 0.35 (buy the dip)                                     │
│                                                                         │
│  Waiting for opposite side condition...                                │
│                                                                         │
│  Check: 0.35 + DOWN_ask <= 0.93 (sumTarget)                            │
│         DOWN_ask = 0.57 → 0.35 + 0.57 = 0.92 ✅                        │
│                                                                         │
│  Leg2: Buy DOWN @ 0.57                                                 │
│                                                                         │
│  ══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  Position: 25x UP + 25x DOWN = $23.00 cost                             │
│  Settlement: 25 × $1.00 = $25.00                                       │
│  Profit: $2.00 (8.7%)                                                  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Stop-Loss Mechanism

If Leg2 condition is not met within 60 seconds after Leg1:

```
Leg1 @ 0.35 bought UP
  ↓
Wait 60 seconds...
  ↓
Leg2 condition not met (DOWN price too high)
  ↓
Stop-Loss: Sell UP @ current price
```

## Auto-Rotation & Redemption

The script supports continuous multi-market operation:

1. **Preload**: Load next market 2 minutes before current one ends
2. **Auto-Switch**: Seamless transition when market ends
3. **Auto-Redeem**: Automatically redeem winning positions 5 minutes after settlement

```typescript
enableAutoRotate({
  enabled: true,
  underlyings: ['XRP'],
  duration: '15m',
  settleStrategy: 'redeem',       // Wait for settlement then redeem
  autoSettle: true,
  preloadMinutes: 2,
  redeemWaitMinutes: 5,           // Wait 5 min after end
  redeemRetryIntervalSeconds: 30  // Check every 30s
});
```

## PM2 Deployment (GCP Server)

```bash
# ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'xrp-dip',
      script: 'npx',
      args: 'tsx scripts/dip-arb/auto-trade.ts --xrp',
      cwd: '~/poly-sdk',
      env: { PRIVATE_KEY: '0x...' }
    },
    {
      name: 'eth-dip',
      script: 'npx',
      args: 'tsx scripts/dip-arb/auto-trade.ts --eth',
      cwd: '~/poly-sdk',
      env: { PRIVATE_KEY: '0x...' }
    }
  ]
};

# Start
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Parameter Reference

| sumTarget | Min Profit Rate | Risk Level |
|-----------|-----------------|------------|
| 0.85 | 17.6% | Aggressive, fewer opportunities |
| 0.90 | 11.1% | Moderately aggressive |
| 0.93 | 7.5% | Balanced (ETH recommended) |
| 0.95 | 5.3% | Conservative (BTC recommended) |
| 0.98 | 2.0% | Very conservative |

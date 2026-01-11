# Polymarket Leaderboard API 文档

## 概述

Polymarket 官方 Data API 现已支持时间段过滤：

| 功能 | 支持 | 说明 |
|------|------|------|
| **时间过滤** | ✅ | DAY, WEEK, MONTH, ALL |
| **排序** | ✅ | PNL, VOL |
| **分类过滤** | ✅ | POLITICS, SPORTS, CRYPTO 等 |
| **分页** | ✅ | limit (1-50), offset (0-1000) |

## 1. Data API 排行榜

### 端点

```
GET https://data-api.polymarket.com/v1/leaderboard
```

### 完整参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `timePeriod` | enum | DAY | 时间段: `DAY`, `WEEK`, `MONTH`, `ALL` |
| `orderBy` | enum | PNL | 排序: `PNL`, `VOL` |
| `category` | enum | OVERALL | 分类: `OVERALL`, `POLITICS`, `SPORTS`, `CRYPTO`, `CULTURE`, `WEATHER`, `ECONOMICS`, `TECH`, `FINANCE` |
| `limit` | number | 25 | 每页条数 (1-50) |
| `offset` | number | 0 | 偏移量 (0-1000) |
| `user` | string | - | 过滤特定用户 (0x 地址) |
| `userName` | string | - | 过滤特定用户名 |

### 返回数据

```typescript
interface LeaderboardEntry {
  address: string;      // proxyWallet 地址
  rank: number;         // 排名 (在指定时间段内)
  pnl: number;          // 时间段内 PnL (USDC)
  volume: number;       // 时间段内成交量 (USDC)
  userName?: string;    // 用户名
  xUsername?: string;   // X/Twitter 用户名
  verifiedBadge?: boolean;
  profileImage?: string;// 头像 URL
}
```

### SDK 使用

```typescript
import { PolymarketSDK } from '@catalyst-team/poly-sdk';

const sdk = new PolymarketSDK();

// 获取今日 Top 10 (按 PnL)
const dailyTop = await sdk.dataApi\.fetchLeaderboard({
  timePeriod: 'DAY',
  orderBy: 'PNL',
  limit: 10,
});

// 获取本周 Top 20 (按成交量)
const weeklyByVolume = await sdk.dataApi\.fetchLeaderboard({
  timePeriod: 'WEEK',
  orderBy: 'VOL',
  limit: 20,
});

// 获取政治类别月度排行
const politicsMonthly = await sdk.dataApi\.fetchLeaderboard({
  timePeriod: 'MONTH',
  category: 'POLITICS',
  limit: 50,
});

// 查询特定用户的周排名
const userStats = await sdk.dataApi\.fetchLeaderboard({
  timePeriod: 'WEEK',
  user: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
});
console.log(`用户排名: #${userStats.entries[0].rank}, PnL: $${userStats.entries[0].pnl}`);
```

---

## 2. WalletService 便捷方法

WalletService 提供了更简洁的 API 调用方式：

### 时间段排行榜

```typescript
// 获取本周 Top 20 (按 PnL)
const weeklyByPnl = await sdk.wallets.getLeaderboardByPeriod('week', 20, 'pnl');

// 获取今日 Top 10 (按成交量)
const dailyByVolume = await sdk.wallets.getLeaderboardByPeriod('day', 10, 'volume');

// 按市场分类获取
const politicsWeekly = await sdk.wallets.getLeaderboardByPeriod('week', 20, 'pnl', 'POLITICS');
```

### 查询特定用户

```typescript
// 获取用户的周排名和 PnL
const userStats = await sdk.wallets.getUserPeriodPnl(address, 'week');
if (userStats) {
  console.log(`排名: #${userStats.rank}`);
  console.log(`PnL: $${userStats.pnl.toLocaleString()}`);
  console.log(`成交量: $${userStats.volume.toLocaleString()}`);
}

// 获取用户在特定分类的月排名
const userPolitics = await sdk.wallets.getUserPeriodPnl(address, 'month', 'POLITICS');
```

### 返回数据

```typescript
interface PeriodLeaderboardEntry {
  address: string;        // 钱包地址
  rank: number;           // 排名 (时间段内)
  volume: number;         // 成交量 (USDC)
  pnl: number;            // 盈亏 (USDC) - 官方 API 提供
  totalPnl: number;       // 总盈亏
  // 用户资料
  userName?: string;
  profileImage?: string;
}
```

### 支持的参数

| 参数 | 值 |
|------|-----|
| period | `'day'`, `'week'`, `'month'`, `'all'` |
| sortBy | `'pnl'`, `'volume'` |
| category | `'OVERALL'`, `'POLITICS'`, `'SPORTS'`, `'CRYPTO'`, 等 |

---

## 3. 单钱包详细统计 (Subgraph)

对于需要更详细的链上活动统计（不仅仅是 PnL），可以使用 Subgraph 查询：

```typescript
// 获取钱包的详细时间段统计（包含链上活动）
const stats = await sdk.wallets.getWalletStatsByPeriod(address, 'week');

console.log(`成交量: $${stats.volume}`);
console.log(`交易次数: ${stats.tradeCount}`);
console.log(`Maker/Taker: ${stats.makerCount}/${stats.takerCount}`);
console.log(`Split/Merge/Redeem: ${stats.splitCount}/${stats.mergeCount}/${stats.redemptionCount}`);
```

### 返回数据

```typescript
interface WalletPeriodStats {
  address: string;
  period: 'day' | 'week' | 'month' | 'all';
  startTime: number;
  endTime: number;
  // 交易统计
  volume: number;
  tradeCount: number;
  makerVolume: number;
  takerVolume: number;
  makerCount: number;
  takerCount: number;
  // 链上活动
  splitCount: number;
  mergeCount: number;
  redemptionCount: number;
  redemptionPayout: number;
}
```

---

## 4. API 参考

### DataApiClient

```typescript
// 基础调用
const result = await sdk.dataApi\.fetchLeaderboard({
  timePeriod: 'WEEK',   // 'DAY' | 'WEEK' | 'MONTH' | 'ALL'
  orderBy: 'PNL',       // 'PNL' | 'VOL'
  category: 'OVERALL',  // 'POLITICS' | 'SPORTS' | 'CRYPTO' | ...
  limit: 50,            // 1-50
  offset: 0,            // 0-1000
  user: '0x...',        // 可选：过滤特定用户
});
```

### WalletService

```typescript
// 时间段排行榜
await sdk.wallets.getLeaderboardByPeriod('week', 20, 'pnl');
await sdk.wallets.getLeaderboardByPeriod('month', 50, 'volume', 'POLITICS');

// 查询特定用户
await sdk.wallets.getUserPeriodPnl(address, 'week');
await sdk.wallets.getUserPeriodPnl(address, 'month', 'SPORTS');

// 详细链上统计 (Subgraph)
await sdk.wallets.getWalletStatsByPeriod(address, 'week');
```

---

## 5. 性能说明

### 请求耗时

| 方法 | 首次请求 | 缓存命中 |
|------|----------|----------|
| `dataApi\.fetchLeaderboard()` | ~200ms | ~0ms |
| `wallets.getLeaderboardByPeriod()` | ~200ms | ~0ms |
| `wallets.getUserPeriodPnl()` | ~200ms | ~0ms |
| `wallets.getWalletStatsByPeriod()` | ~500ms | ~0ms |

> 官方 API 在服务端计算排行榜，响应速度很快

### 缓存 TTL

| 数据类型 | 缓存时间 |
|----------|----------|
| Leaderboard | 1 小时 |
| Period Stats | 2 分钟 |

---

## 6. 完整示例

```typescript
import { PolymarketSDK, TimePeriod } from '@catalyst-team/poly-sdk';

async function analyzeTraders() {
  const sdk = new PolymarketSDK();

  // 1. 获取全时间 Top 10 (按 PnL)
  console.log('=== 历史盈利 Top 10 ===');
  const allTimeTop = await sdk.dataApi\.fetchLeaderboard({
    timePeriod: 'ALL',
    orderBy: 'PNL',
    limit: 10,
  });
  allTimeTop.entries.forEach((t, i) => {
    console.log(`${i + 1}. ${t.address} - PnL: $${t.pnl.toLocaleString()}`);
  });

  // 2. 获取本周 Top 10 (按成交量)
  console.log('\n=== 本周活跃 Top 10 (按成交量) ===');
  const weeklyByVolume = await sdk.wallets.getLeaderboardByPeriod('week', 10, 'volume');
  weeklyByVolume.forEach((t, i) => {
    console.log(`${i + 1}. ${t.address} - Volume: $${t.volume.toLocaleString()}`);
  });

  // 3. 获取本周 Top 10 (按 PnL)
  console.log('\n=== 本周盈利 Top 10 ===');
  const weeklyByPnl = await sdk.wallets.getLeaderboardByPeriod('week', 10, 'pnl');
  weeklyByPnl.forEach((t, i) => {
    console.log(`${i + 1}. ${t.address} - PnL: $${t.pnl.toLocaleString()}`);
  });

  // 4. 查询特定用户的各时间段排名
  const targetWallet = weeklyByPnl[0].address;
  console.log(`\n=== 分析钱包: ${targetWallet} ===`);

  for (const period of ['day', 'week', 'month'] as TimePeriod[]) {
    const userStats = await sdk.wallets.getUserPeriodPnl(targetWallet, period);
    if (userStats) {
      console.log(`\n${period}:`);
      console.log(`  排名: #${userStats.rank}`);
      console.log(`  PnL: $${userStats.pnl.toLocaleString()}`);
      console.log(`  成交量: $${userStats.volume.toLocaleString()}`);
    }
  }

  // 5. 获取详细链上统计 (Subgraph)
  const stats = await sdk.wallets.getWalletStatsByPeriod(targetWallet, 'week');
  console.log(`\n=== 链上活动统计 ===`);
  console.log(`交易次数: ${stats.tradeCount}`);
  console.log(`Maker/Taker: ${stats.makerCount}/${stats.takerCount}`);
  console.log(`Split/Merge/Redeem: ${stats.splitCount}/${stats.mergeCount}/${stats.redemptionCount}`);
}

analyzeTraders();
```

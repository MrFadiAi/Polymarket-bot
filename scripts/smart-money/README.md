# Smart Money 测试脚本

Copy Trading 功能的 E2E 测试。

## 运行

```bash
# 需要 .env 配置 PRIVATE_KEY
cd packages/poly-sdk

# 主测试 - 使用 SmartMoneyService 跟单
pnpm exec tsx scripts/smart-money/01-e2e.ts

# 底层测试 - 直接用 RealtimeServiceV2 + TradingService
pnpm exec tsx scripts/smart-money/02-e2e-low-level.ts

# 功能测试 - 测试 SmartMoneyService 各方法
pnpm exec tsx scripts/smart-money/03-test-service.ts
```

## 脚本说明

| 脚本 | 说明 |
|------|------|
| `01-e2e.ts` | 完整 E2E：监听信号 → 执行跟单 → 验证成功 |
| `02-e2e-low-level.ts` | 底层 E2E：直接用 WebSocket + Trading API |
| `03-test-service.ts` | 功能测试：Smart Money 检测、订阅、同步 |

## 关键发现 (2025-12-28)

1. **Activity WebSocket 不会广播用户自己的交易** - 需要用 `getTrades()` 或返回值验证
2. **执行延迟约 2 秒** - 从收到信号到订单成交
3. **最快验证方式** - `createMarketOrder` 返回 `success + transactionHashes` 即成功

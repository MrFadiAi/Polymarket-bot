# Poly-SDK Examples

Comprehensive examples demonstrating the Polymarket SDK capabilities.

## Running Examples

```bash
# From poly-sdk directory
npx tsx examples/01-basic-usage.ts

# Or use pnpm scripts
pnpm example:basic       # 01-basic-usage.ts
pnpm example:smart-money # 02-smart-money.ts
```

---

## Examples Overview

| # | File | Description | Auth Required |
|---|------|-------------|---------------|
| 01 | `basic-usage.ts` | Trending markets, orderbook data | No |
| 02 | `smart-money.ts` | Smart money wallet analysis | No |
| 03 | `market-analysis.ts` | Market search and analysis | No |
| 04 | `kline-aggregation.ts` | Price history and KLine data | No |
| 05 | `follow-wallet-strategy.ts` | Copy trading simulation | No |
| 06 | `services-demo.ts` | WalletService & MarketService | No |
| 07 | `realtime-websocket.ts` | Real-time orderbook updates | No |
| 08 | `trading-orders.ts` | Order placement and management | Yes |
| 09 | `rewards-tracking.ts` | Liquidity rewards tracking | Yes |
| 10 | `ctf-operations.ts` | Split/Merge/Redeem tokens | Yes |
| 11 | `live-arbitrage-scan.ts` | Scan markets for arbitrage | No |
| 12 | `trending-arb-monitor.ts` | Real-time arbitrage monitoring | No |
| 13 | `arbitrage-service.ts` | Complete ArbitrageService workflow | Yes |

---

## Example Details

### 01 - Basic Usage

Get started with the SDK. Fetches trending markets and orderbook data.

```typescript
import { PolymarketSDK } from '@catalyst-team/poly-sdk';
const sdk = new PolymarketSDK();
const trending = await sdk.gammaApi.getTrendingMarkets(5);
```

### 02 - Smart Money Analysis

Analyze wallet trading performance and identify profitable traders.

- Fetch wallet positions and activity
- Calculate P&L and win rate
- Identify high-performing wallets

### 03 - Market Analysis

Search and analyze markets by various criteria.

- Search by keyword
- Filter by volume, liquidity
- Analyze market spreads

### 04 - KLine Aggregation

Get price history for charting.

- Multi-timeframe candles (1m, 5m, 1h, 1d)
- OHLCV data
- Dual YES/NO price tracking

### 05 - Follow Wallet Strategy

Simulate copy trading based on smart money signals.

- Monitor wallet activity
- Generate trade signals
- Backtest strategy performance

### 06 - Services Demo

High-level service abstractions.

- `WalletService` - Wallet analysis helpers
- `MarketService` - Market data aggregation

### 07 - Real-time WebSocket

Live market data streaming using `RealtimeServiceV2`.

- Connect to Polymarket WebSocket (official client)
- Real-time orderbook updates
- Price change events
- Last trade notifications
- Crypto price subscriptions (BTC, ETH)

```typescript
import { RealtimeServiceV2 } from '@catalyst-team/poly-sdk';

const realtime = new RealtimeServiceV2({ debug: false });
realtime.connect();

realtime.once('connected', () => {
  const sub = realtime.subscribeMarket(yesTokenId, noTokenId, {
    onOrderbook: (book) => console.log('Book:', book),
    onPriceUpdate: (update) => console.log('Price:', update),
  });
});
```

### 08 - Trading Orders

Trading functionality using `TradingService` (requires private key).

```bash
POLYMARKET_PRIVATE_KEY=0x... npx tsx examples/08-trading-orders.ts
```

- Market data: `getMarket()`, `getOrderbook()`, `getPricesHistory()`
- Create limit/market orders: `createLimitOrder()`, `createMarketOrder()`
- Cancel orders: `cancelOrder()`, `cancelAllOrders()`
- Check order status: `getOpenOrders()`, `getTrades()`
- Rewards: `getCurrentRewards()`, `isOrderScoring()`

### 09 - Rewards Tracking

Track liquidity provider rewards using `TradingService`.

- Find markets with active rewards
- Check if orders are scoring
- Track daily earnings

### 10 - CTF Operations

On-chain token operations (requires private key + USDC.e).

```bash
POLY_PRIVKEY=0x... npx tsx examples/10-ctf-operations.ts
```

**Critical:** Uses USDC.e (not native USDC):
| Token | Address | CTF Compatible |
|-------|---------|----------------|
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | Yes |
| Native USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | No |

Operations:
- **Split**: USDC.e → YES + NO tokens
- **Merge**: YES + NO → USDC.e (arbitrage profit)
- **Redeem**: Winning tokens → USDC.e

### 11 - Live Arbitrage Scan

Scan markets for arbitrage opportunities (read-only).

- Fetches active markets
- Calculates effective prices
- Detects long/short arb opportunities

### 12 - Trending Arbitrage Monitor

Continuous monitoring of trending markets.

- Real-time orderbook analysis
- Correct effective price calculation
- Configurable scan intervals

### 13 - ArbitrageService Complete Workflow

Full arbitrage workflow using `ArbitrageService` (requires private key).

```bash
POLYMARKET_PRIVATE_KEY=0x... npx tsx examples/13-arbitrage-service.ts
```

- **ArbitrageService**: High-level API for arbitrage detection and execution
- Market scanning with configurable criteria
- Real-time WebSocket monitoring
- Auto-execution with profit thresholds
- Position clearing and settlement

---

## Arbitrage Concepts

Polymarket orderbooks have a mirroring property:
- **Buying YES @ P = Selling NO @ (1-P)**

Correct effective prices:
```
effectiveBuyYes = min(YES.ask, 1 - NO.bid)
effectiveBuyNo = min(NO.ask, 1 - YES.bid)
effectiveSellYes = max(YES.bid, 1 - NO.ask)
effectiveSellNo = max(NO.bid, 1 - YES.ask)
```

| Arb Type | Condition | Action |
|----------|-----------|--------|
| Long | `effectiveBuyYes + effectiveBuyNo < 1` | Buy both, merge for $1 |
| Short | `effectiveSellYes + effectiveSellNo > 1` | Split $1, sell both |

---

## Environment Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `POLYMARKET_PRIVATE_KEY` | Private key for trading | 08, 09, 10, 13 |
| `SCAN_INTERVAL_MS` | Arb scan interval (ms) | 12, 13 |
| `PROFIT_THRESHOLD` | Min arb profit % | 11, 12, 13 |

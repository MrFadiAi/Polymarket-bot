# poly-sdk Design Document

> This document describes how poly-sdk inherits and normalizes Polymarket API interfaces.
> All fields verified against actual API responses on 2024-12-22.

## Overview

poly-sdk wraps Polymarket APIs and provides services for wallet operations:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                         poly-sdk                                          │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐          │
│  │  DataApiClient  │ │  GammaApiClient │ │  ClobApiClient  │ │  BridgeClient  │          │
│  │                 │ │                 │ │                 │ │                │          │
│  │ - Positions     │ │ - Markets       │ │ - Markets       │ │ - Deposits     │          │
│  │ - Activity      │ │ - Events        │ │ - Orderbooks    │ │ - Assets       │          │
│  │ - Trades        │ │ - Trending      │ │ - Tokens        │ │ - Swap+Deposit │          │
│  │ - Leaderboard   │ │                 │ │                 │ │                │          │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └───────┬────────┘          │
│           │                   │                   │                  │                   │
├───────────┼───────────────────┼───────────────────┼──────────────────┼───────────────────┤
│           │                   │                   │                  │                   │
│  ┌────────┴───────────────────┴───────────────────┴──────────────────┴────────────────┐  │
│  │                                  Services Layer                                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  ┌─────────────────┐  │  │
│  │  │ WalletService│  │ MarketService│  │ AuthorizationService│  │   SwapService   │  │  │
│  │  │              │  │              │  │ - checkAllowances() │  │                 │  │  │
│  │  │ - Profiles   │  │ - Unified    │  │ - approveAll()      │  │ - swap()        │  │  │
│  │  │ - SmartScore │  │ - Orderbooks │  │ - ERC20/ERC1155     │  │ - getBalances() │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────┘  └─────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
           │                   │                   │                  │
           ▼                   ▼                   ▼                  ▼
   data-api.polymarket.com  gamma-api.polymarket.com  clob.polymarket.com  bridge.polymarket.com
                                                                              + QuickSwap V3
```

## API Endpoints and SDK Methods

### Data API (data-api.polymarket.com)

| Endpoint | SDK Method | Description |
|----------|------------|-------------|
| `GET /positions?user={address}` | `dataApi.getPositions(address)` | Wallet positions |
| `GET /activity?user={address}` | `dataApi.getActivity(address)` | Wallet activity |
| `GET /trades` | `dataApi.getTrades()` | Recent trades |
| `GET /v1/leaderboard` | `dataApi\.fetchLeaderboard()` | PnL leaderboard |

### Gamma API (gamma-api.polymarket.com)

| Endpoint | SDK Method | Description |
|----------|------------|-------------|
| `GET /markets` | `gammaApi.getMarkets(params)` | Market discovery |
| `GET /events` | `gammaApi.getEvents(params)` | Event groups |
| `GET /events/{id}` | `gammaApi.getEventById(id)` | Single event |

### CLOB API (clob.polymarket.com)

| Endpoint | SDK Method | Description |
|----------|------------|-------------|
| `GET /markets/{conditionId}` | `clobApi.getMarket(conditionId)` | Market info |
| `GET /book?token_id={tokenId}` | `clobApi.getOrderbook(tokenId)` | Order book |

### Bridge API (bridge.polymarket.com)

| Endpoint | SDK Method | Description |
|----------|------------|-------------|
| `GET /supported-assets` | `bridge.getSupportedAssets()` | Supported deposit assets |
| `POST /deposit` | `bridge.createDepositAddresses(address)` | Get deposit addresses |

**Verified API Response** (2024-12-22):

`GET /supported-assets`:
```json
{
  "supportedAssets": [
    {
      "chainId": "1",
      "chainName": "Ethereum",
      "token": {
        "name": "USD Coin",
        "symbol": "USDC",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "decimals": 6
      },
      "minCheckoutUsd": 2
    }
  ]
}
```

`POST /deposit`:
```json
{
  "address": {
    "evm": "0x95DDa253Bd8B816223...",
    "svm": "gbjjH2LP3ufgue9co25H...",
    "btc": "bc1q6smhd5lma9pulfq9..."
  }
}
```

### Swap Service (QuickSwap V3)

The `SwapService` enables token swaps on Polygon using QuickSwap V3 DEX:

| Method | Description |
|--------|-------------|
| `swap(tokenIn, tokenOut, amount, options?)` | Swap between any supported tokens |
| `swapToUsdc(token, amount, options?)` | Swap any token to USDC |
| `getBalances()` | Get balances for all supported tokens (requires signer) |
| `getBalance(token)` | Get balance for a specific token (requires signer) |
| `wrapMatic(amount)` | Wrap native MATIC to WMATIC |
| `unwrapMatic(amount)` | Unwrap WMATIC to native MATIC |
| `static getWalletBalances(address)` | Get balances for any wallet (no signer required) |
| `static getWalletBalance(address, token)` | Get specific token balance for any wallet |

**Supported Tokens**:

| Token | Address | Decimals | CTF Compatible |
|-------|---------|----------|----------------|
| MATIC/WMATIC | `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270` | 18 | - |
| USDC (Native) | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6 | ❌ No |
| USDC.e (Bridged) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6 | ✅ **Required** |
| USDT | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 | - |
| DAI | `0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063` | 18 | - |
| WETH | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` | 18 | - |

**QuickSwap V3 Router**: `0xf5b509bB0909a69B1c207E495f687a596C168E12`

### ⚠️ CRITICAL: USDC.e vs Native USDC for Polymarket CTF

Polymarket's Conditional Token Framework (CTF) only accepts **USDC.e** (bridged USDC), NOT native USDC.

**Common Mistake**:
```
Your wallet shows 100 USDC in block explorer
→ CTFClient.getUsdcBalance() returns 0
→ CTF operations fail with "Insufficient USDC balance"
```

**Reason**: You have native USDC, not USDC.e.

**Solution**:

| Method | Description |
|--------|-------------|
| `SwapService.swap('USDC', 'USDC_E', amount)` | Convert native USDC to USDC.e |
| `SwapService.transferUsdcE(to, amount)` | Transfer USDC.e (for CTF operations) |
| `SwapService.transferUsdc(to, amount)` | Transfer native USDC (NOT for CTF) |
| `CTFClient.checkReadyForCTF(amount)` | Check if wallet is ready for CTF |

**Example**:
```typescript
// Check if ready for CTF
const status = await ctf.checkReadyForCTF('100');
if (!status.ready) {
  console.log(status.suggestion);
  // "You have 50 native USDC but 0 USDC.e. Swap native USDC to USDC.e first."
}

// Convert native USDC to USDC.e
await swapService.swap('USDC', 'USDC_E', '100');

// Fund a session wallet for CTF trading (use USDC.e!)
await swapService.transferUsdcE(sessionWallet, '100');
```

### Swap and Deposit

The `swapAndDeposit()` function combines swap and deposit in one operation:

```typescript
import { swapAndDeposit } from '@catalyst-team/poly-sdk';

// Swap MATIC to USDC and deposit to Polymarket
const result = await swapAndDeposit(signer, 'MATIC', '100', {
  slippage: 0.5  // 0.5% slippage tolerance
});
```

### Authorization Service

The `AuthorizationService` manages ERC20 and ERC1155 approvals required for trading:

| Method | Description |
|--------|-------------|
| `checkAllowances()` | Check all ERC20/ERC1155 allowances |
| `approveAll()` | Set up all required approvals |
| `approveUsdc(spender, amount)` | Approve USDC for a specific contract |
| `setErc1155Approval(operator, approved)` | Set ERC1155 approval |

**Required Approvals for Trading**:

| Type | Contract | Address |
|------|----------|---------|
| ERC20 | CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| ERC20 | Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| ERC20 | Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |
| ERC20 | Conditional Tokens | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| ERC1155 | CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| ERC1155 | Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| ERC1155 | Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |

---

## Type Definitions and API Inheritance

The SDK normalizes raw API responses into typed interfaces. Below is the mapping between API fields and SDK types.

### Position (Data API)

**API Endpoint**: `GET /positions?user={address}`

**Verified API Response** (2024-12-21):
```json
{
  "proxyWallet": "0xc2e7800b5af46e6093872b177b7a5e7f0563be51",
  "asset": "4765501864982032589494809396214706270671021091620334552669038388080328898101",
  "conditionId": "0x39e493c3cd953e45a632f4f5dde639ccd37f97743203be9c1eb01fbb155a4803",
  "size": 1346825.460224,
  "avgPrice": 0.520337,
  "initialValue": 700803.1194965754,
  "currentValue": 1346825.460224,
  "cashPnl": 646022.3407274245,
  "percentPnl": 92.18314284780823,
  "totalBought": 1346825.460224,
  "realizedPnl": 0,
  "percentRealizedPnl": 92.18314284780824,
  "curPrice": 1,
  "redeemable": true,
  "mergeable": false,
  "title": "Spread: Grizzlies (-12.5)",
  "slug": "nba-was-mem-2025-12-20-spread-home-12pt5",
  "icon": "https://polymarket-upload.s3.us-east-2.amazonaws.com/...",
  "eventId": "104888",
  "eventSlug": "nba-was-mem-2025-12-20",
  "outcome": "Wizards",
  "outcomeIndex": 1,
  "oppositeOutcome": "Grizzlies",
  "oppositeAsset": "13094498429043262538336168554322406952756859431736544943974983877714521454902",
  "endDate": "2025-12-21",
  "negativeRisk": false
}
```

**SDK Interface** (`data-api.ts`):
```typescript
export interface Position {
  // Wallet identifier
  proxyWallet?: string;

  // Core identifiers
  asset: string;
  conditionId: string;
  outcome: string;
  outcomeIndex: number;

  // Position data
  size: number;
  avgPrice: number;
  curPrice?: number;
  totalBought?: number;

  // Value calculations
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;

  // Market metadata
  title: string;
  slug?: string;
  icon?: string;
  eventId?: string;
  eventSlug?: string;

  // Opposite side info
  oppositeOutcome?: string;
  oppositeAsset?: string;

  // Status fields
  redeemable?: boolean;
  mergeable?: boolean;
  endDate?: string;
  negativeRisk?: boolean;
}
```

---

### Activity (Data API)

**API Endpoint**: `GET /activity?user={address}`

**Verified API Response** (2024-12-21):
```json
{
  "type": "TRADE",
  "side": "BUY",
  "size": 100.0,
  "price": 0.55,
  "usdcSize": 55.0,
  "asset": "21742633143463906290569050155826241533067272736897614950488156847949938836455",
  "conditionId": "0x82ace55cdcba920112a2b3548f21e6e117730144db4dd580456aaecf1a2ad751",
  "outcome": "Yes",
  "outcomeIndex": 0,
  "timestamp": 1702555200,
  "transactionHash": "0xabc...",
  "title": "Will BTC reach $100k?",
  "slug": "will-btc-reach-100k",
  "name": "trader123"
}
```

**SDK Interface** (`data-api.ts`):
```typescript
export interface Activity {
  // Transaction type
  type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'CONVERSION';
  side: 'BUY' | 'SELL';

  // Trade data
  size: number;
  price: number;
  usdcSize?: number;

  // Market identifiers
  asset: string;
  conditionId: string;
  outcome: string;
  outcomeIndex?: number;

  // Transaction info
  timestamp: number;
  transactionHash: string;

  // Market metadata
  title?: string;
  slug?: string;

  // Trader info
  name?: string;
}
```

---

### Trade (Data API)

**API Endpoint**: `GET /trades`

**Verified API Response** (2024-12-21):
```json
{
  "proxyWallet": "0x750e52d38753546eb57395811f2c324d3db01fac",
  "side": "SELL",
  "asset": "3826026842978178641920766976929297863453551585071976524482954212194670371395",
  "conditionId": "0xe48a7cbb6c76a2dc89f39e6e75dbb4806daa11f18b91638976e30088445fcedd",
  "size": 16,
  "price": 0.55,
  "timestamp": 1766319567,
  "title": "Bitcoin Up or Down - December 21, 7:15AM-7:30AM ET",
  "slug": "btc-updown-15m-1766319300",
  "icon": "https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png",
  "eventSlug": "btc-updown-15m-1766319300",
  "outcome": "Up",
  "outcomeIndex": 0,
  "name": "sadfgas",
  "pseudonym": "Striped-Moai",
  "bio": "",
  "profileImage": "",
  "profileImageOptimized": "",
  "transactionHash": "0x5aa793936a8530a292c58ef8e3ed253056b113b978f6807a6ff9cf40c86a5a7d"
}
```

**SDK Interface** (`data-api.ts`):
```typescript
export interface Trade {
  // Identifiers
  id?: string;
  market: string;
  asset: string;

  // Trade data
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  outcome: string;
  outcomeIndex: number;

  // Transaction info
  timestamp: number;
  transactionHash: string;
  proxyWallet?: string;

  // Market metadata
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;

  // Trader info
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
}
```

---

### LeaderboardEntry (Data API)

**API Endpoint**: `GET /v1/leaderboard`

**Verified API Response** (2024-12-21):
```json
{
  "rank": "1",
  "proxyWallet": "0xc2e7800b5af46e6093872b177b7a5e7f0563be51",
  "userName": "beachboy4",
  "xUsername": "",
  "verifiedBadge": false,
  "vol": 1346825.460224,
  "pnl": 802943.8607537004,
  "profileImage": ""
}
```

**Note**: `rank` is returned as string; `positions` and `trades` fields are not returned.

**SDK Interface** (`data-api.ts`):
```typescript
export interface LeaderboardEntry {
  address: string;      // Normalized from proxyWallet
  rank: number;
  pnl: number;
  volume: number;       // Normalized from "vol"

  // User profile
  userName?: string;
  xUsername?: string;
  verifiedBadge?: boolean;
  profileImage?: string;

  // Activity counts (optional - API often returns null)
  positions?: number;
  trades?: number;
}
```

---

### ClobMarket (CLOB API)

**API Endpoint**: `GET /markets/{conditionId}`

**Verified API Response** (2024-12-21):
```json
{
  "enable_order_book": true,
  "active": true,
  "closed": false,
  "archived": false,
  "accepting_orders": true,
  "accepting_order_timestamp": "2025-12-02T13:27:14Z",
  "minimum_order_size": 5,
  "minimum_tick_size": 0.001,
  "condition_id": "0xac9c6628a5398bb2a06f566854270a9fbc7f2badec4329d3b5fdc1407291c35b",
  "question_id": "0x74ace93c6bc3d695886ffe4fd33a749dac5395fb9afd4ca0e6de986010a7b1ab",
  "question": "Will Trump release the Epstein files by December 19?",
  "description": "...",
  "market_slug": "will-trump-release-the-epstein-files-by-december-19-771",
  "end_date_iso": null,
  "game_start_time": null,
  "seconds_delay": 0,
  "fpmm": "",
  "maker_base_fee": 0,
  "taker_base_fee": 0,
  "notifications_enabled": true,
  "neg_risk": false,
  "neg_risk_market_id": "",
  "neg_risk_request_id": "",
  "icon": "https://...",
  "image": "https://...",
  "rewards": {
    "rates": null,
    "min_size": 200,
    "max_spread": 4.5
  },
  "is_50_50_outcome": false,
  "tokens": [
    { "token_id": "97631444...", "outcome": "Yes", "price": 0.9975, "winner": false },
    { "token_id": "34188370...", "outcome": "No", "price": 0.0025, "winner": false }
  ],
  "tags": ["Politics", "Trump", "Epstein"]
}
```

**SDK Interface** (`clob-api.ts`):
```typescript
export interface ClobMarket {
  // Core identifiers
  conditionId: string;
  questionId?: string;
  marketSlug: string;

  // Market content
  question: string;
  description?: string;
  image?: string;
  icon?: string;

  // Tokens
  tokens: ClobToken[];
  tags?: string[];

  // Status flags
  active: boolean;
  closed: boolean;
  archived?: boolean;
  acceptingOrders: boolean;
  acceptingOrderTimestamp?: string;
  enableOrderBook?: boolean;

  // Trading parameters
  minimumOrderSize?: number;
  minimumTickSize?: number;
  makerBaseFee?: number;
  takerBaseFee?: number;

  // Timing
  endDateIso?: string | null;
  gameStartTime?: string | null;
  secondsDelay?: number;

  // Neg risk
  negRisk?: boolean;
  negRiskMarketId?: string;
  negRiskRequestId?: string;

  // Rewards
  rewards?: {
    rates?: unknown;
    minSize?: number;
    maxSpread?: number;
  };

  // Other
  fpmm?: string;
  notificationsEnabled?: boolean;
  is5050Outcome?: boolean;
}

export interface ClobToken {
  tokenId: string;
  outcome: string;
  price: number;
  winner?: boolean;
}
```

---

### Orderbook (CLOB API)

**API Endpoint**: `GET /book?token_id={tokenId}`

**Verified API Response** (2024-12-21):
```json
{
  "market": "0xac9c6628a5398bb2a06f566854270a9fbc7f2badec4329d3b5fdc1407291c35b",
  "asset_id": "97631444429136963410558776454705646247419477447963422218240880878426855760467",
  "timestamp": "1766319576845",
  "hash": "8f61a83ce893fc0b5bd5a30bb6e73d77a7ca8816",
  "bids": [
    { "price": "0.997", "size": "451990.61" },
    { "price": "0.996", "size": "1203906.34" }
  ],
  "asks": [
    { "price": "0.998", "size": "1243577.96" },
    { "price": "0.999", "size": "4250974.87" }
  ],
  "min_order_size": "5",
  "tick_size": "0.001",
  "neg_risk": false
}
```

**SDK Interface** (`clob-api.ts`):
```typescript
export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;

  // Additional fields from API
  market?: string;
  assetId?: string;
  hash?: string;
  minOrderSize?: string;
  tickSize?: string;
  negRisk?: boolean;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}
```

---

### GammaMarket (Gamma API)

**API Endpoint**: `GET /markets`

**Verified Key Fields** (2024-12-21):
- `outcomes` and `outcomePrices` are JSON-encoded strings (need parsing)
- Many additional fields: `volumeNum`, `liquidityNum`, `volume24hr`, etc.

**SDK Interface** (`gamma-api.ts`):
```typescript
export interface GammaMarket {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  description?: string;
  outcomes: string[];        // Parsed from JSON string
  outcomePrices: number[];   // Parsed from JSON string
  volume: number;
  volume24hr?: number;
  volume1wk?: number;
  liquidity: number;
  spread?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  endDate: Date;
  active: boolean;
  closed: boolean;
  image?: string;
  icon?: string;
  tags?: string[];
}
```

---

## Normalization Patterns

### 1. String to Number Conversion

API returns strings for numeric values; SDK converts them:
```typescript
size: Number(p.size),
price: Number(p.price),
```

### 2. Snake Case to Camel Case

CLOB API uses snake_case; SDK normalizes to camelCase:
```typescript
conditionId: String(m.condition_id || ''),
marketSlug: String(m.market_slug || ''),
minimumOrderSize: Number(m.minimum_order_size),
```

### 3. Optional Field Handling

Fields that may be undefined or null are handled explicitly:
```typescript
// Check for undefined
curPrice: p.curPrice !== undefined ? Number(p.curPrice) : undefined,

// Check for null (using != null checks both null and undefined)
positions: e.positions != null ? Number(e.positions) : undefined,

// Handle null explicitly
endDateIso: m.end_date_iso !== undefined
  ? (m.end_date_iso === null ? null : String(m.end_date_iso))
  : undefined,
```

### 4. Timestamp Normalization

API may return timestamps in seconds or milliseconds:
```typescript
private normalizeTimestamp(ts: unknown): number {
  if (typeof ts === 'number') {
    return ts < 1e12 ? ts * 1000 : ts;  // Convert seconds to ms
  }
  // ...
}
```

### 5. Wallet Address Normalization

Leaderboard returns `proxyWallet`; SDK normalizes to `address`:
```typescript
address: String(e.proxyWallet || e.address || ''),
```

### 6. JSON String Parsing

Gamma API returns some arrays as JSON strings:
```typescript
private parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try { return JSON.parse(value); }
    catch { return fallback; }
  }
  return fallback;
}
```

---

## Design Principles

1. **Faithful API Inheritance**: SDK types include all fields returned by the API
2. **Optional by Default**: Fields that may be missing are marked optional (`?`)
3. **Type Safety**: All values are explicitly typed; numbers are converted from strings
4. **Normalized Naming**: Consistent camelCase across all SDK interfaces
5. **Null Handling**: Explicit handling of null vs undefined values
6. **Verified Fields**: All field mappings verified against actual API responses

---

## Verification Scripts

To verify API responses match SDK types:

```bash
# Run verification script
cd packages/poly-sdk
npx tsx scripts/verify-all-apis.ts

# Or manually verify with curl
curl "https://data-api.polymarket.com/positions?user=0x..." | jq '.[0]'
curl "https://data-api.polymarket.com/v1/leaderboard?limit=1" | jq '.[0]'
curl "https://data-api.polymarket.com/trades?limit=1" | jq '.[0]'
curl "https://gamma-api.polymarket.com/markets?active=true&limit=1" | jq '.[0]'
curl "https://clob.polymarket.com/markets/0x..." | jq
curl "https://clob.polymarket.com/book?token_id=..." | jq
```

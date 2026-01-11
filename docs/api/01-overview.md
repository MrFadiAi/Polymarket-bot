# @catalyst-team/poly-sdk API Reference

Complete API documentation for the Polymarket SDK.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Clients](#core-clients)
  - [PolymarketSDK](#polymarketsdk)
  - [ClobApiClient](#clobapiclient)
  - [GammaApiClient](#gammaapiclient)
  - [DataApiClient](#dataapiclient)
  - [TradingClient](#tradingclient)
  - [BridgeClient](#bridgeclient)
  - [CTFClient](#ctfclient)
  - [WebSocketManager](#websocketmanager)
- [Services](#services)
  - [MarketService](#marketservice)
  - [ArbitrageService](#arbitrageservice)
  - [RealtimeService](#realtimeservice)
  - [WalletService](#walletservice)
- [Utility Functions](#utility-functions)
- [Types](#types)
- [Error Handling](#error-handling)

---

## Installation

```bash
pnpm add @catalyst-team/poly-sdk
```

## Quick Start

```typescript
import { PolymarketSDK } from '@catalyst-team/poly-sdk';

const sdk = new PolymarketSDK();

// Get trending markets
const markets = await sdk.gammaApi.getTrendingMarkets(10);

// Get orderbook for a specific market
const orderbook = await sdk.clobApi.getProcessedOrderbook(markets[0].conditionId);

console.log('Long arb profit:', orderbook.summary.longArbProfit);
```

---

## Core Clients

### PolymarketSDK

The main SDK class that provides access to all API clients.

```typescript
import { PolymarketSDK } from '@catalyst-team/poly-sdk';

const sdk = new PolymarketSDK(config?: PolymarketSDKConfig);
```

#### Constructor Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.chainId` | `number` | Polygon chain ID (137 = mainnet, 80002 = Amoy testnet) |
| `config.privateKey` | `string` | Private key for trading operations |
| `config.apiCredentials` | `ApiCredentials` | Pre-generated API credentials |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `gammaApi` | `GammaApiClient` | Market discovery and metadata |
| `clobApi` | `ClobApiClient` | Orderbook and market data |
| `dataApi` | `DataApiClient` | Positions, trades, leaderboard |

---

### ClobApiClient

Central Limit Order Book (CLOB) API client for orderbook and market data.

```typescript
import { ClobApiClient, RateLimiter, Cache } from '@catalyst-team/poly-sdk';

const client = new ClobApiClient(
  rateLimiter: RateLimiter,
  cache: Cache,
  config?: {
    chainId?: number;
    signer?: unknown;
    creds?: ApiCredentials;
  }
);
```

#### Methods

##### `getMarket(conditionId: string): Promise<ClobMarket>`

Get market information by condition ID.

```typescript
const market = await client.getMarket('0x82ace55...');
console.log(market.question);          // "Will BTC reach $100k?"
console.log(market.tokens[0].tokenId); // YES token ID
console.log(market.tokens[1].tokenId); // NO token ID
```

**Parameters:**
- `conditionId` - The unique condition identifier for the market

**Returns:** `ClobMarket` object with market details and tokens

---

##### `getOrderbook(tokenId: string): Promise<Orderbook>`

Get raw orderbook for a specific token.

```typescript
const orderbook = await client.getOrderbook('21742633...');

console.log('Best bid:', orderbook.bids[0]?.price);  // e.g., 0.55
console.log('Best ask:', orderbook.asks[0]?.price);  // e.g., 0.57
console.log('Spread:', orderbook.asks[0]?.price - orderbook.bids[0]?.price);
```

**Parameters:**
- `tokenId` - The ERC-1155 token ID (YES or NO token)

**Returns:** `Orderbook` with sorted bids and asks

---

##### `getProcessedOrderbook(conditionId: string): Promise<ProcessedOrderbook>`

Get processed orderbook with complete market analysis and arbitrage calculations.

```typescript
const processed = await client.getProcessedOrderbook('0x82ace55...');

// Check for arbitrage
if (processed.summary.longArbProfit > 0.003) {
  console.log('Long arb opportunity!');
  console.log('Buy YES @', processed.summary.effectivePrices.effectiveBuyYes);
  console.log('Buy NO @', processed.summary.effectivePrices.effectiveBuyNo);
  console.log('Profit:', processed.summary.longArbProfit * 100, '%');
}
```

**Parameters:**
- `conditionId` - The unique condition identifier for the market

**Returns:** `ProcessedOrderbook` with both YES/NO books and analytics

**Important Notes:**

Polymarket orderbooks have a mirroring property:
- Buying YES @ P = Selling NO @ (1-P)
- The same order appears in both books

Correct arbitrage calculation uses "effective prices":
- `effectiveBuyYes = min(YES.ask, 1 - NO.bid)`
- `effectiveBuyNo = min(NO.ask, 1 - YES.bid)`

---

### GammaApiClient

Market discovery and metadata API client.

```typescript
import { GammaApiClient, RateLimiter, Cache } from '@catalyst-team/poly-sdk';

const client = new GammaApiClient(rateLimiter: RateLimiter, cache: Cache);
```

#### Methods

##### `getMarkets(params?: MarketSearchParams): Promise<GammaMarket[]>`

Get markets with optional filters and sorting.

```typescript
// Get active markets sorted by 24h volume
const markets = await client.getMarkets({
  active: true,
  closed: false,
  order: 'volume24hr',
  ascending: false,
  limit: 50,
});

// Search by slug
const market = await client.getMarkets({
  slug: 'will-btc-reach-100k',
  limit: 1,
});
```

**MarketSearchParams:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `slug` | `string` | Filter by market slug |
| `conditionId` | `string` | Filter by condition ID |
| `active` | `boolean` | Filter by active status |
| `closed` | `boolean` | Filter by closed status |
| `limit` | `number` | Maximum results (default: 100) |
| `offset` | `number` | Pagination offset |
| `order` | `string` | Sort field: `volume24hr`, `liquidity`, `endDate` |
| `ascending` | `boolean` | Sort direction |

---

##### `getTrendingMarkets(limit?: number): Promise<GammaMarket[]>`

Get trending markets sorted by 24-hour volume.

```typescript
const trending = await client.getTrendingMarkets(10);

for (const market of trending) {
  console.log(`${market.question}`);
  console.log(`  24h Volume: $${market.volume24hr?.toLocaleString()}`);
  console.log(`  YES Price: ${(market.outcomePrices[0] * 100).toFixed(1)}%`);
}
```

---

##### `getEvents(params?): Promise<GammaEvent[]>`

Get events (market groupings) with optional filters.

```typescript
const events = await client.getEvents({ active: true, limit: 20 });
```

---

### DataApiClient

User data, positions, and leaderboard API client.

```typescript
import { DataApiClient, RateLimiter, Cache } from '@catalyst-team/poly-sdk';

const client = new DataApiClient(rateLimiter: RateLimiter, cache: Cache);
```

#### Methods

##### `getPositions(address: string): Promise<Position[]>`

Get positions for a wallet address.

```typescript
const positions = await client.getPositions('0x1234...');
for (const pos of positions) {
  console.log(`${pos.title}: ${pos.size} shares @ ${pos.avgPrice}`);
  console.log(`  PnL: $${pos.cashPnl?.toFixed(2)}`);
}
```

---

##### `getActivity(address: string, params?): Promise<Activity[]>`

Get trading activity for a wallet.

```typescript
const activity = await client.getActivity('0x1234...', { limit: 50 });
```

---

##### `getTrades(params?): Promise<Trade[]>`

Get recent trades, optionally filtered by market.

```typescript
const trades = await client.getTrades({ market: '0x82ace55...', limit: 100 });
```

---

##### `getLeaderboard(params?): Promise<LeaderboardPage>`

Get leaderboard rankings.

```typescript
const leaderboard = await client.getLeaderboard({ limit: 50, offset: 0 });
for (const entry of leaderboard.entries) {
  console.log(`#${entry.rank} ${entry.address}: $${entry.pnl.toFixed(2)}`);
}
```

---

### TradingClient

Trading operations client (requires authentication).

```typescript
import { TradingClient, RateLimiter } from '@catalyst-team/poly-sdk';

const client = new TradingClient(rateLimiter: RateLimiter, {
  privateKey: '0x...',
  chainId: 137,  // Polygon mainnet
});

await client.initialize();
```

#### Methods

##### `createOrder(params: OrderParams): Promise<OrderResult>`

Create and post a limit order.

```typescript
const result = await client.createOrder({
  tokenId: '21742633...',
  side: 'BUY',
  price: 0.55,
  size: 100,
  orderType: 'GTC',  // Good-til-cancelled
});

if (result.success) {
  console.log('Order placed:', result.orderId);
}
```

**OrderParams:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tokenId` | `string` | Token ID to trade |
| `side` | `'BUY' \| 'SELL'` | Order side |
| `price` | `number` | Price (0.001 - 0.999) |
| `size` | `number` | Size in shares |
| `orderType` | `'GTC' \| 'GTD'` | Order type (default: GTC) |
| `expiration` | `number` | Expiration for GTD orders (unix seconds) |

---

##### `createMarketOrder(params: MarketOrderParams): Promise<OrderResult>`

Create and post a market order.

```typescript
const result = await client.createMarketOrder({
  tokenId: '21742633...',
  side: 'BUY',
  amount: 50,  // $50 USDC
  orderType: 'FOK',  // Fill-or-kill
});
```

---

##### `cancelOrder(orderId: string): Promise<OrderResult>`

Cancel an open order.

```typescript
await client.cancelOrder('0xabc123...');
```

---

##### `getOpenOrders(marketId?: string): Promise<Order[]>`

Get all open orders.

```typescript
const orders = await client.getOpenOrders();
console.log(`${orders.length} open orders`);
```

---

##### `getBalanceAllowance(assetType, tokenId?): Promise<{ balance, allowance }>`

Check balance and allowance.

```typescript
const { balance, allowance } = await client.getBalanceAllowance('COLLATERAL');
console.log(`USDC Balance: ${balance}`);
```

---

### BridgeClient

Cross-chain deposit client for funding your Polymarket account.

```typescript
import { BridgeClient } from '@catalyst-team/poly-sdk';

const bridge = new BridgeClient();
```

#### Key Concept: Universal Deposit Addresses

The Polymarket Bridge API returns **universal deposit addresses** by chain type:

- **EVM Address**: A single address works for ALL EVM chains (Ethereum, Polygon, Arbitrum, Base, Optimism)
- **Solana Address**: For Solana deposits
- **Bitcoin Address**: For Bitcoin deposits

This means you don't need a different address for each chain - the same EVM address accepts deposits from Ethereum, Polygon, Arbitrum, Base, and Optimism.

#### Supported Chains

| Chain | Chain ID | Min Deposit | Address Type |
|-------|----------|-------------|--------------|
| Ethereum | 1 | $10 | EVM |
| Polygon | 137 | $2 | EVM |
| Arbitrum | 42161 | $2 | EVM |
| Optimism | 10 | $2 | EVM |
| Base | 8453 | $2 | EVM |
| Solana | - | $5-10 | SVM |
| Bitcoin | - | $10+ | BTC |

#### Supported Tokens (Polygon)

| Token | Address | Description |
|-------|---------|-------------|
| Native USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | Circle's native USDC |
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | Bridged USDC (PoS) |
| USDT | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | Tether USD |
| DAI | `0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063` | Dai Stablecoin |
| WETH | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` | Wrapped Ether |
| POL | Native | Polygon native token |

#### Methods

##### `getSupportedAssets(): Promise<BridgeSupportedAsset[]>`

Get all supported chains and tokens.

```typescript
const assets = await bridge.getSupportedAssets();

// Filter for Polygon assets
const polygonAssets = assets.filter(a => a.chainId === 137);
for (const asset of polygonAssets) {
  console.log(`${asset.tokenSymbol}: min $${asset.minDepositUsd}`);
}
```

---

##### `createDepositAddresses(walletAddress: string): Promise<CreateDepositResponse>`

Get universal deposit addresses for your wallet.

**API Response Format:**
```json
{
  "address": {
    "evm": "0x1234...",    // Works for ALL EVM chains
    "svm": "ABC123...",     // Solana address
    "btc": "bc1q..."        // Bitcoin address
  }
}
```

```typescript
const result = await bridge.createDepositAddresses('0xYourWallet');

console.log('EVM deposit address:', result.address.evm);    // All EVM chains
console.log('Solana deposit address:', result.address.svm); // Solana
console.log('Bitcoin deposit address:', result.address.btc); // Bitcoin
```

---

##### `getEvmDepositAddress(walletAddress: string): Promise<string>`

Get the universal EVM deposit address. **Recommended method.**

```typescript
const evmAddr = await bridge.getEvmDepositAddress('0xYourWallet');

// This address works for:
// - Ethereum USDC, ETH
// - Polygon Native USDC, USDC.e, MATIC
// - Arbitrum USDC, ETH
// - Base USDC, ETH
// - Optimism USDC, ETH
console.log(`Send to: ${evmAddr}`);
```

---

##### `getSolanaDepositAddress(walletAddress: string): Promise<string>`

Get the Solana deposit address.

```typescript
const solAddr = await bridge.getSolanaDepositAddress('0xYourWallet');
console.log(`Send SOL or USDC to: ${solAddr}`);
```

---

##### `getBtcDepositAddress(walletAddress: string): Promise<string>`

Get the Bitcoin deposit address.

```typescript
const btcAddr = await bridge.getBtcDepositAddress('0xYourWallet');
console.log(`Send BTC to: ${btcAddr}`);
```

---

##### `getDepositAddress(address, chainId, tokenSymbol): Promise<DepositAddress | null>` _(deprecated)_

> **Deprecated**: Use `getEvmDepositAddress()`, `getSolanaDepositAddress()`, or `getBtcDepositAddress()` instead.

---

##### `isSupported(chainId, tokenSymbol): Promise<boolean>`

Check if a chain/token combination is supported.

```typescript
const supported = await bridge.isSupported(137, 'USDC');
console.log(`Polygon USDC supported: ${supported}`);
```

---

##### `getMinDeposit(chainId, tokenSymbol): Promise<{ amount, usd } | null>`

Get minimum deposit amount.

```typescript
const min = await bridge.getMinDeposit(137, 'USDC');
if (min) {
  console.log(`Min deposit: ${min.amount} (~$${min.usd})`);
}
```

---

#### Deposit Flow Example

```typescript
import { providers, Wallet, Contract, utils } from 'ethers';
import { BridgeClient, BRIDGE_TOKENS } from '@catalyst-team/poly-sdk';

// 1. Setup
const provider = new providers.JsonRpcProvider('https://polygon-rpc.com');
const wallet = new Wallet(PRIVATE_KEY, provider);
const bridge = new BridgeClient();

// 2. Get EVM deposit address (works for all EVM chains)
const depositAddress = await bridge.getEvmDepositAddress(wallet.address);
console.log(`Deposit to: ${depositAddress}`);

// 3. Send Native USDC to the deposit address
const nativeUsdc = new Contract(
  BRIDGE_TOKENS.POLYGON_NATIVE_USDC,
  ['function transfer(address to, uint256 amount) returns (bool)'],
  wallet
);

const amount = utils.parseUnits('5.0', 6); // 5 USDC
const tx = await nativeUsdc.transfer(depositAddress, amount);
await tx.wait();

console.log('Deposit sent! Bridge will convert to USDC.e in 1-5 minutes.');
console.log('Bridge fee: ~0.16%');
```

---

### CTFClient

CTF (Conditional Token Framework) client for on-chain token operations.

```typescript
import { CTFClient } from '@catalyst-team/poly-sdk';

const ctf = new CTFClient({
  privateKey: '0x...',
  rpcUrl: 'https://polygon-rpc.com',
  chainId: 137,
});
```

#### Core Concepts

**Token IDs**: Each market has two token IDs (YES and NO). There are two ways to identify tokens:
1. **CLOB Token IDs**: From the CLOB API, used for trading
2. **Calculated Position IDs**: From `calculatePositionId()`, derived from conditionId

**Important**: Always use CLOB Token IDs for balance queries. The calculated position IDs may differ.

#### Constants

```typescript
import {
  CTF_CONTRACT,         // 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
  USDC_CONTRACT,        // 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (USDC.e)
  NEG_RISK_CTF_EXCHANGE, // 0xC5d563A36AE78145C45a50134d48A1215220f80a
  NEG_RISK_ADAPTER,     // 0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296
  USDC_DECIMALS,        // 6
} from '@catalyst-team/poly-sdk';
```

#### Methods

##### `split(conditionId: string, amount: number): Promise<SplitResult>`

Split USDC.e into YES + NO tokens.

```typescript
// Split 10 USDC.e into 10 YES + 10 NO
const result = await ctf.split('0xabc123...', 10);

console.log(`TX: ${result.txHash}`);
console.log(`Status: ${result.status}`);
```

---

##### `merge(conditionId: string, amount: number): Promise<MergeResult>`

Merge YES + NO tokens back into USDC.e.

```typescript
// Merge 10 YES + 10 NO into 10 USDC.e
const result = await ctf.merge('0xabc123...', 10);

console.log(`TX: ${result.txHash}`);
console.log(`USDC received: ${result.usdcReceived}`);
```

---

##### `getPositionBalanceByTokenIds(conditionId: string, tokenIds: TokenIds): Promise<PositionBalance>`

Get token balances using CLOB token IDs. **Recommended method.**

```typescript
import type { TokenIds } from '@catalyst-team/poly-sdk';

// Get token IDs from CLOB API
const market = await clobApi.getMarket('0xabc123...');
const yesToken = market.tokens.find(t => t.outcome === 'Yes');
const noToken = market.tokens.find(t => t.outcome === 'No');

const tokenIds: TokenIds = {
  yesTokenId: yesToken.tokenId,
  noTokenId: noToken.tokenId,
};

const balance = await ctf.getPositionBalanceByTokenIds('0xabc123...', tokenIds);
console.log(`YES: ${balance.yesBalance}, NO: ${balance.noBalance}`);
```

---

##### `canMergeWithTokenIds(conditionId: string, tokenIds: TokenIds, amount: number): Promise<boolean>`

Check if merge is possible with given token balances.

```typescript
const canMerge = await ctf.canMergeWithTokenIds('0xabc123...', tokenIds, 5);
if (canMerge) {
  await ctf.merge('0xabc123...', 5);
}
```

---

##### `getPositionBalance(conditionId: string): Promise<PositionBalance>` _(deprecated)_

> **Deprecated**: Use `getPositionBalanceByTokenIds()` instead. This method uses calculated position IDs which may not match CLOB token IDs.

---

##### `redeem(conditionId: string, outcome?: 'YES' | 'NO'): Promise<RedeemResult>`

Redeem winning tokens after market resolution. **For standard CTF markets only.**

⚠️ **WARNING**: This method uses calculated position IDs. For Polymarket CLOB markets, use `redeemByTokenIds()` instead.

```typescript
// ❌ Don't use for Polymarket - may fail to find balance
const result = await ctf.redeem(conditionId);
```

**When to use `redeem()`:**
- Standard Gnosis CTF markets (non-Polymarket)
- Markets where position IDs are calculated from conditionId
- Direct CTF contract interactions without CLOB

---

##### `redeemByTokenIds(conditionId: string, tokenIds: TokenIds, outcome?: 'YES' | 'NO'): Promise<RedeemResult>`

Redeem winning tokens using Polymarket token IDs. **Recommended for Polymarket.**

```typescript
// ✅ Use this for Polymarket CLOB markets
const tokenIds: TokenIds = {
  yesTokenId: '25064375110792967023484002819116042931016336431092144471807003884255851454283',
  noTokenId: '98190367690492181203391990709979106077460946443309150166954079213761598385827',
};

const result = await ctf.redeemByTokenIds(conditionId, tokenIds);
console.log(`Redeemed ${result.tokensRedeemed} ${result.outcome} tokens`);
console.log(`Received ${result.usdcReceived} USDC`);
```

**Parameters:**
- `conditionId` - The market condition ID
- `tokenIds` - Polymarket token IDs from CLOB API
- `outcome` - Optional: 'YES' or 'NO'. Auto-detects winning outcome if not provided.

**Returns:** `RedeemResult` with transaction details

**Why use this method?**
- Polymarket wraps CTF positions into ERC-1155 tokens with custom IDs
- The token IDs from CLOB API differ from calculated position IDs
- This method queries balances using the correct Polymarket token IDs

---

##### `getMarketResolution(conditionId: string): Promise<MarketResolution>`

Check if a market is resolved and get the winning outcome.

```typescript
const resolution = await ctf.getMarketResolution(conditionId);
if (resolution.isResolved) {
  console.log(`Winner: ${resolution.winningOutcome}`); // 'YES' or 'NO'
}
```

---

##### `getUsdcBalance(): Promise<string>`

Get USDC.e balance.

```typescript
const balance = await ctf.getUsdcBalance();
console.log(`USDC.e: ${balance}`);
```

---

#### Types

```typescript
interface TokenIds {
  yesTokenId: string;
  noTokenId: string;
}

interface PositionBalance {
  conditionId: string;
  yesBalance: string;
  noBalance: string;
  yesPositionId: string;
  noPositionId: string;
}

interface SplitResult {
  txHash: string;
  status: 'success' | 'failed';
  gasUsed: string;
  yesTokenId: string;
  noTokenId: string;
  amountSplit: string;
}

interface MergeResult {
  txHash: string;
  status: 'success' | 'failed';
  gasUsed: string;
  usdcReceived: string;
}

interface RedeemResult {
  success: boolean;
  txHash: string;
  outcome: 'YES' | 'NO';
  tokensRedeemed: string;
  usdcReceived: string;
  gasUsed: string;
}

interface MarketResolution {
  conditionId: string;
  isResolved: boolean;
  winningOutcome?: 'YES' | 'NO';
  payoutNumerators?: number[];
}
```

---

#### CTF Arbitrage Example

```typescript
import { CTFClient, ClobApiClient, TokenIds } from '@catalyst-team/poly-sdk';

const ctf = new CTFClient({ privateKey, rpcUrl, chainId: 137 });
const clobApi = new ClobApiClient(rateLimiter, cache);

// 1. Get market and token IDs
const market = await clobApi.getMarket(conditionId);
const tokenIds: TokenIds = {
  yesTokenId: market.tokens.find(t => t.outcome === 'Yes').tokenId,
  noTokenId: market.tokens.find(t => t.outcome === 'No').tokenId,
};

// 2. Get processed orderbook
const ob = await clobApi.getProcessedOrderbook(conditionId);

// 3. Check for long arbitrage (buy YES + NO, merge for profit)
if (ob.summary.longArbProfit > 0.005) {
  // Buy YES and NO tokens via CLOB
  // Then merge
  const balance = await ctf.getPositionBalanceByTokenIds(conditionId, tokenIds);
  const minBalance = Math.min(
    parseFloat(balance.yesBalance),
    parseFloat(balance.noBalance)
  );

  if (minBalance > 0) {
    const result = await ctf.merge(conditionId, minBalance);
    console.log(`Merged ${minBalance}, received ${result.usdcReceived} USDC`);
  }
}

// 4. Check for short arbitrage (split, sell YES + NO for profit)
if (ob.summary.shortArbProfit > 0.005) {
  // Split USDC into tokens
  await ctf.split(conditionId, 10);
  // Sell tokens via CLOB
}
```

---

### WebSocketManager

Real-time market data via WebSocket.

```typescript
import { WebSocketManager } from '@catalyst-team/poly-sdk';

const ws = new WebSocketManager({ enableLogging: true });
```

#### Methods

##### `subscribe(assetIds: string[]): Promise<void>`

Subscribe to market updates.

```typescript
ws.on('bookUpdate', (update) => {
  console.log(`Book update for ${update.assetId}`);
  console.log(`  Best bid: ${update.bids[0]?.price}`);
});

ws.on('priceUpdate', (update) => {
  console.log(`Price: ${update.price}`);
});

await ws.subscribe(['21742633...', '79707176...']);
```

---

##### `unsubscribe(assetIds: string[]): Promise<void>`

Unsubscribe from specific assets.

---

##### `unsubscribeAll(): Promise<void>`

Unsubscribe from all assets and cleanup.

---

## Services

### MarketService

High-level market analysis service.

```typescript
import { MarketService } from '@catalyst-team/poly-sdk';

const service = new MarketService(clobApi, gammaApi);

// Get market with full analysis
const analysis = await service.getMarketWithAnalysis('0x82ace55...');
```

---

### ArbitrageService

Arbitrage opportunity detection.

```typescript
import { ArbitrageService } from '@catalyst-team/poly-sdk';

const service = new ArbitrageService(clobApi, gammaApi);

// Scan for opportunities
const opportunities = await service.scanForOpportunities({
  minProfit: 0.003,  // 0.3% minimum
  maxMarkets: 50,
});

for (const opp of opportunities) {
  console.log(`${opp.type} arb: ${(opp.profit * 100).toFixed(2)}%`);
}
```

---

### RealtimeService

High-level WebSocket subscription management.

```typescript
import { RealtimeService, WebSocketManager } from '@catalyst-team/poly-sdk';

const ws = new WebSocketManager();
const realtime = new RealtimeService(ws);

// Subscribe to a market pair
const sub = await realtime.subscribeMarket(yesTokenId, noTokenId, {
  onPairUpdate: (update) => {
    console.log(`YES: ${update.yes.price}, NO: ${update.no.price}`);
    console.log(`Spread: ${update.spread}`);
  },
});

// Later: unsubscribe
await sub.unsubscribe();
```

---

## Utility Functions

### `getEffectivePrices(yesAsk, yesBid, noAsk, noBid)`

Calculate effective prices accounting for orderbook mirroring.

```typescript
import { getEffectivePrices } from '@catalyst-team/poly-sdk';

const effective = getEffectivePrices(0.57, 0.55, 0.45, 0.43);
console.log('Effective buy YES:', effective.effectiveBuyYes);
console.log('Effective buy NO:', effective.effectiveBuyNo);
```

---

### `checkArbitrage(yesAsk, yesBid, noAsk, noBid)`

Check for arbitrage opportunities.

```typescript
import { checkArbitrage } from '@catalyst-team/poly-sdk';

const arb = checkArbitrage(0.57, 0.55, 0.45, 0.43);
if (arb.hasOpportunity) {
  console.log(`${arb.type} opportunity: ${arb.profit * 100}%`);
}
```

---

## Types

### ClobMarket

```typescript
interface ClobMarket {
  conditionId: string;      // Unique market identifier
  question: string;         // Market question
  description?: string;     // Resolution criteria
  marketSlug: string;       // URL-friendly slug
  tokens: ClobToken[];      // YES and NO tokens
  acceptingOrders: boolean; // Can accept orders
  endDateIso: string;       // ISO end date
  active: boolean;          // Is active
  closed: boolean;          // Is resolved
}
```

### ClobToken

```typescript
interface ClobToken {
  tokenId: string;  // ERC-1155 token ID
  outcome: string;  // "Yes" or "No"
  price: number;    // Current price (0-1)
}
```

### Orderbook

```typescript
interface Orderbook {
  bids: OrderbookLevel[];  // Sorted descending by price
  asks: OrderbookLevel[];  // Sorted ascending by price
  timestamp: number;       // Fetch timestamp (ms)
}

interface OrderbookLevel {
  price: number;  // Price (0.001-0.999)
  size: number;   // Size in shares
}
```

### ProcessedOrderbook

```typescript
interface ProcessedOrderbook {
  yes: {
    bid: number;
    ask: number;
    bidSize: number;
    askSize: number;
    bidDepth: number;
    askDepth: number;
    spread: number;
  };
  no: {
    bid: number;
    ask: number;
    bidSize: number;
    askSize: number;
    bidDepth: number;
    askDepth: number;
    spread: number;
  };
  summary: {
    askSum: number;
    bidSum: number;
    effectivePrices: {
      effectiveBuyYes: number;
      effectiveBuyNo: number;
      effectiveSellYes: number;
      effectiveSellNo: number;
    };
    effectiveLongCost: number;
    effectiveShortRevenue: number;
    longArbProfit: number;    // > 0 = opportunity
    shortArbProfit: number;   // > 0 = opportunity
    totalBidDepth: number;
    totalAskDepth: number;
    imbalanceRatio: number;
    yesSpread: number;
  };
}
```

### Position

```typescript
interface Position {
  asset: string;        // Token ID
  conditionId: string;  // Market ID
  outcome: string;      // "Yes" or "No"
  outcomeIndex: number; // 0 = Yes, 1 = No
  size: number;         // Shares held
  avgPrice: number;     // Average entry price
  curPrice?: number;    // Current price
  cashPnl?: number;     // Unrealized PnL in USDC
  percentPnl?: number;  // Unrealized PnL %
  realizedPnl?: number; // Realized PnL
  title: string;        // Market title
}
```

---

## Error Handling

The SDK uses `PolymarketError` for all errors.

```typescript
import { PolymarketError, ErrorCode } from '@catalyst-team/poly-sdk';

try {
  await client.getMarket('invalid-id');
} catch (error) {
  if (error instanceof PolymarketError) {
    switch (error.code) {
      case ErrorCode.NOT_FOUND:
        console.log('Market not found');
        break;
      case ErrorCode.RATE_LIMITED:
        console.log('Rate limited, retry later');
        break;
      case ErrorCode.API_ERROR:
        console.log('API error:', error.message);
        break;
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Resource not found (404) |
| `RATE_LIMITED` | Rate limit exceeded (429) |
| `UNAUTHORIZED` | Authentication required (401) |
| `FORBIDDEN` | Access denied (403) |
| `INVALID_RESPONSE` | Invalid API response |
| `API_ERROR` | General API error |
| `ORDER_FAILED` | Order placement failed |
| `NETWORK_ERROR` | Network connectivity issue |

---

## License

MIT

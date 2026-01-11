# Poly-SDK Scripts

Utility scripts for testing and operating with Polymarket.

## Environment Setup

Set environment variable:

```bash
export POLY_PRIVKEY=0x...  # Your private key
```

Or pass inline:

```bash
POLY_PRIVKEY=0x... npx tsx scripts/...
```

---

## Directory Structure

```
scripts/
├── approvals/          # ERC20/ERC1155 approval scripts
├── deposit/            # USDC deposit and swap scripts
├── trading/            # Order and position management
├── wallet/             # Wallet balance and verification
├── verify/             # API verification tests
└── research/           # Market research and analysis
```

---

## Scripts Reference

### `approvals/` - Token Approvals

| Script | Description |
|--------|-------------|
| `check-allowance.ts` | Check USDC allowance for CTF Exchange |
| `check-all-allowances.ts` | Check all token allowances at once |
| `check-ctf-approval.ts` | Check CTF/ERC1155 approval status |
| `approve-neg-risk.ts` | Approve USDC for Neg Risk Exchange |
| `approve-erc1155.ts` | Approve ERC1155 for CTF Exchange |
| `approve-neg-risk-erc1155.ts` | Approve ERC1155 for Neg Risk Exchange |

```bash
# Check all allowances
npx tsx scripts/approvals/check-all-allowances.ts

# Approve for neg risk markets
npx tsx scripts/approvals/approve-neg-risk.ts
```

---

### `deposit/` - Deposits & Swaps

| Script | Description |
|--------|-------------|
| `deposit-native-usdc.ts` | Deposit Native USDC via Bridge |
| `deposit-usdc.ts` | Deposit USDC.e directly |
| `swap-usdc-to-usdce.ts` | Swap Native USDC → USDC.e on DEX |

```bash
# Check deposit address and status
npx tsx scripts/deposit/deposit-native-usdc.ts check

# Deposit $50 via Bridge
npx tsx scripts/deposit/deposit-native-usdc.ts deposit 50
```

**Important:** USDC.e is required for Polymarket CTF operations. Native USDC must be swapped or bridged first.

---

### `trading/` - Orders & Positions

| Script | Description |
|--------|-------------|
| `check-orders.ts` | View open orders and recent trades |
| `test-order.ts` | Test order placement |
| `sell-nvidia-positions.ts` | Sell specific positions |

```bash
# Check open orders
npx tsx scripts/trading/check-orders.ts

# Test order placement
npx tsx scripts/trading/test-order.ts
```

---

### `wallet/` - Wallet Management

| Script | Description |
|--------|-------------|
| `check-wallet-balances.ts` | Check all wallet balances |
| `verify-wallet-tools.ts` | Verify wallet MCP tools |
| `test-wallet-operations.ts` | Test wallet operations |

```bash
# Check balances
npx tsx scripts/wallet/check-wallet-balances.ts
```

---

### `verify/` - API Verification

| Script | Description |
|--------|-------------|
| `verify-all-apis.ts` | Verify all API endpoints |
| `test-search-mcp.ts` | Test MCP search tools |
| `test-approve-trading.ts` | Test trading approvals |

```bash
# Verify all APIs work
npx tsx scripts/verify/verify-all-apis.ts
```

---

### `research/` - Market Research

| Script | Description |
|--------|-------------|
| `research-markets.ts` | ARB/MM/Hybrid market analysis |

```bash
# Find arbitrage and MM opportunities
npx tsx scripts/research/research-markets.ts
```

---

## Important Concepts

### USDC Types

| Token | Address | Use |
|-------|---------|-----|
| USDC.e (Bridged) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | **Required for CTF** |
| Native USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | Must swap to USDC.e |

### Effective Prices

Polymarket orderbooks have mirroring:
- Buying YES @ P = Selling NO @ (1-P)

```
effectiveBuyYes = min(YES.bestAsk, 1 - NO.bestBid)
effectiveBuyNo = min(NO.bestAsk, 1 - YES.bestBid)
```

### Arbitrage Detection

| Type | Condition | Action |
|------|-----------|--------|
| Long | `effectiveBuyYes + effectiveBuyNo < 1` | Buy both, merge |
| Short | `effectiveSellYes + effectiveSellNo > 1` | Split, sell both |

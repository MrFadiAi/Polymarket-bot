# ArbitrageService Tests

Comprehensive test suite for arbitrage functionality including unit tests and integration tests.

## Running Tests

```bash
# Unit tests (fast, no API calls)
npx tsx scripts/arb-tests/01-unit-tests.ts

# Integration tests (real API calls, ~2 minutes)
npx tsx scripts/arb-tests/02-integration-tests.ts

# Or from monorepo root
pnpm -F @catalyst-team/poly-sdk tsx scripts/arb-tests/01-unit-tests.ts
pnpm -F @catalyst-team/poly-sdk tsx scripts/arb-tests/02-integration-tests.ts
```

## Test Coverage

### 01-unit-tests.ts

Tests for `getEffectivePrices()` and `checkArbitrage()` functions from `src/utils/price-utils.ts`.

**getEffectivePrices() Tests (7 tests):**
- Normal market scenarios
- Long arbitrage opportunities
- Short arbitrage opportunities
- Mirror relationship validation
- Edge cases (prices near 0, near 1, 50/50 market)

**checkArbitrage() Tests (20 tests):**
- Long arbitrage detection (clear and small opportunities)
- Short arbitrage detection (various scenarios)
- No arbitrage scenarios (balanced markets, tight spreads)
- Edge cases (extreme arb, prices near boundaries)
- Boundary conditions (break-even scenarios)
- Mirror relationship effects
- Real-world scenarios (FaZe BO3 example)

### Key Insights from Tests

1. **Mirror Relationship**: In Polymarket, buying YES at price P is equivalent to selling NO at (1-P). The effective price functions correctly account for this by using `min()` for buy prices and `max()` for sell prices.

2. **Long Arb Priority**: When both long and short arbitrage exist simultaneously (which happens when mirrored orders create inefficiencies), the `checkArbitrage()` function returns long arbitrage first. This is intentional since long arb is typically easier to execute (buy two assets, merge immediately).

3. **Effective Prices**:
   - `effectiveBuyYes = min(yesAsk, 1 - noBid)` - Best price to acquire YES tokens
   - `effectiveBuyNo = min(noAsk, 1 - yesBid)` - Best price to acquire NO tokens
   - `effectiveSellYes = max(yesBid, 1 - noAsk)` - Best price to sell YES tokens
   - `effectiveSellNo = max(noBid, 1 - yesAsk)` - Best price to sell NO tokens

4. **Arbitrage Detection**:
   - Long arb: `effectiveBuyYes + effectiveBuyNo < 1.00`
   - Short arb: `effectiveSellYes + effectiveSellNo > 1.00`

## Test Results Format

Each test outputs:
- Input prices (YES ask/bid, NO ask/bid)
- Calculated result
- Expected result
- Pass/Fail status

Summary shows:
- Total tests run
- Number passed
- Number failed
- List of failed tests (if any)

### 02-integration-tests.ts

Integration tests for ArbitrageService using real Polymarket APIs. No private key required (runs in monitor-only mode).

**Test 1: Service Initialization (1 test)**
- Validates ArbitrageService can be instantiated without private key
- Confirms monitor-only mode configuration

**Test 2: Market Scanning (2 tests)**
- Tests `scanMarkets()` with various criteria
- Validates ScanResult structure contains all required fields
- Verifies market data includes: conditionId, tokenIds, effective prices, volume, etc.

**Test 3: Quick Scan (2 tests)**
- Tests `quickScan()` with default and custom parameters
- Validates profit threshold and limit parameters work correctly

**Test 4: WebSocket Connection (4 tests)**
- Tests real-time WebSocket connection to Polymarket
- Monitors orderbook updates for 20 seconds
- Validates service statistics tracking
- Tests clean shutdown

**Duration**: ~115 seconds total
- 11s for market scanning
- 42s for first quick scan
- 42s for second quick scan
- 20s for WebSocket monitoring

**Expected Results**:
- 9 tests total
- All tests should pass
- No arbitrage opportunities required for tests to pass
- WebSocket should connect successfully even without opportunities

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed

# Using Poly Data & Pendulum Flow with Polymarket-bot

## Overview

Polymarket-bot runs 4 strategies (Arbitrage, DipArb, Smart Money copy-trading, Direct Trading) with 6-layer risk management. Two external data sources can unlock comprehensive backtesting across all strategies:

> "6-layer" appears twice in this repo — don't conflate them: (a) the
> bot-level protection layers in `bot-config.ts` `canTrade()` (daily 5% /
> monthly 15% / drawdown 25% / total 40% halt / loss-streak pause /
> exposure cap — note `bot-with-dashboard.ts` `canTrade()` is stale v3.1
> and lacks layers 5–6); (b) the Smart Money wallet-quality gate
> (`evaluateWalletQuality` in `src/utils/risk.ts`). §2.3/§4.1 refer to (b).

- **poly_data** ([github.com/warproxxx/poly_data](https://github.com/warproxxx/poly_data)) — On-chain trade history for all Polymarket markets
- **Pendulum Flow Archive** ([archive.pendulumflow.com](https://archive.pendulumflow.com/)) — Event-level orderbook/trade archive, one parquet file per hour (V3)

---

## 1. What Each Source Provides

### poly_data

Pipeline streams `OrderFilled` events from the CTF Exchange V2 contract via Envio HyperSync, joins with CLOB market metadata.

**Output files:**
- `data/markets.csv` — All ~1.5M markets (condition_id, tokens, question, slug, closed)
- `processed/trades.csv` — Every fill: timestamp, market_id, maker, taker, BUY/SELL, price, USD amount, token amount

**Key for this bot**: The `maker` field gives the wallet address of the person placing the order. Filter by maker to reconstruct any trader's full history.

### Pendulum Flow

Multiple machines record every Polymarket orderbook event hourly. V3 schema
(verified against `2026-09-09T06.parquet` — earlier drafts of this guide
described a `ts/token_id/side/price/size` layout that does not exist):

| event_type | Share of hour-06 | Columns used by this bot |
|------------|------------------|--------------------------|
| `price_change` | ~84.5M | Per-level updates (not currently consumed) |
| `best_bid_ask` | ~9M | `timestamp`, `asset_id`, `best_bid`, `best_ask` (touch stream) |
| `book` | ~164K | `timestamp`, `market`, `asset_id`, `bids[]`, `asks[]` (full depth) |
| `last_trade_price` | ~49K | `timestamp`, `price`, `size`, `side` (prints) |
| `new_market` / `market_resolved` / `tick_size_change` | ~3K | `question`, `slug`, `outcomes`, `assets_ids` (pairing metadata) |

Key facts:
- `market` (BLOB) is shared by the YES/NO pair; `asset_id` (BLOB) is the
  32-byte big-endian uint256 = CTF token ID (`BigInt(hex)`, see
  `assetHexToTokenId`). Pair rows share identical timestamps.
- `bids`/`asks` are `STRUCT(price, size)[]` (up to ~99 levels/side observed;
  can be empty). `best_bid`/`best_ask` are NULL on `book` rows and vice versa.
- Hour files are ~900MB — never bulk-download; filter to one market in
  DuckDB (see §5).

**Key for this bot**: `book` rows map to the backtest harness
(`src/backtest/`): touch + top-N ladders per snapshot, VWAP fills in the
engine, availability windows in the runner.

---

## 2. Strategy-by-Strategy Improvements

### 2.1 Arbitrage — Full Orderbook Replay

**Current state**: `src/backtest/replay.ts` runs `longArbStrategy` on JSONL snapshots
with fee-aware long-arb (buy YES+NO < $1, merge to $1). Snapshots converted from
Pendulum `book` rows carry top-N ladders (`levels`) and the engine walks them
for VWAP fills; `npm run backtest` also prints an availability report
(edge snapshots, window count, median/max window duration). Validated on real
hour-06 data: 214 rows → 106 snapshots, min pair cost 1.01 (no arb — an
efficient market, correctly reported as zero windows).

**What to add:**

| Feature | Source | How |
|---------|--------|-----|
| Historical arb availability | Pendulum Flow | ✅ Done: `scanArbAvailability` in `src/backtest/availability.ts`, printed by the runner (edge fraction, windows, median/max duration). |
| Arb execution with real depth | Pendulum Flow | ✅ Done: `book` ladders → `levels` in snapshots → VWAP fills in `runBacktest` (conservative: direct ladders, mirror route ignored). |
| Competition analysis | poly_data | ✅ Done both sides: maker-side arb footprint via `makerPairBuys` (sub-$1 YES+NO pair-buy windows per maker/market; real run: top maker 90 windows @ best 0.85) + taker-side concentration/repeat-takers/both-sides (`src/backtest/competition.ts`). |
| Arb decay over time | Pendulum Flow | ✅ Done at both granularities: availability windows on `book` snapshots + sub-second episode/survival analysis on the dense `best_bid_ask` touch stream (`src/backtest/decay.ts`, CLI `scripts/backtest/decay.ts`; verified on real hour-06 touches). |

**Implementation**: Export one market's `book` rows with the DuckDB CLI (hour
files are ~900MB — always filter by `market`), then convert with
`scripts/backtest/pendulum-to-jsonl.ts` (pairing + touch/ladder logic in
`src/backtest/pendulum.ts`; `hex()` emits UPPERCASE, normalized to lowercase
here, so asset IDs accept either case, `0x`-prefix, or decimal CTF IDs):
```sql
COPY (
  SELECT epoch_ms(timestamp) AS ts_ms, hex(market) AS market,
         hex(asset_id) AS asset, bids, asks
  FROM '2026-09-09T06.parquet'
  WHERE event_type = 'book' AND market = unhex('<marketHex>')
  ORDER BY timestamp
) TO 'rows.json' (FORMAT JSON);
```
```bash
npx tsx scripts/backtest/pendulum-to-jsonl.ts rows.json snapshots.jsonl \
  --yes <yesAssetHex> --no <noAssetHex> [--max-levels 10]
npm run backtest -- snapshots.jsonl
```
Find a market's hex + asset hexes via its `new_market` row (`assets_ids`,
`question`, `slug`), or take them from the Gamma API (decimal → hex with
`assetHexToTokenId` in reverse).

### 2.2 DipArb — Panic Sell Detection Replay

**Current state**: DipArb (`src/services/dip-arb-service.ts`) trades 5m/15m
crypto up/down markets (BTC/ETH/SOL/XRP; live scripts scan 15m). Leg1
triggers when a side's token best-ask drops ≥ `dipThreshold` vs
`slidingWindowMs` ago — i.e. "15% in 3s" is a *detection window*, not a
market tenor — within the first `windowMinutes` of the round (service
defaults: dip 0.15, window 3s, active 2min; live per-coin overrides in
`scripts/dip-arb/auto-trade.ts`: BTC 20%/5s, ETH 30%/5s, SOL/XRP 40%/3s).
Upside `surge` and oracle-`mispricing` patterns also exist (surge disabled
live). Leg1 FOK-buys `shares` (min $1.50); Leg2 hedges 1:1 with the
opposite side once `leg1price + hedgeAsk ≤ sumTarget` (default 0.92), else
60s timeout or 20% stop-loss emergency-exits Leg1 at the bid; completed
pairs merge at $1. No backtest exists.

**What to add:**

| Feature | Source | How |
|---------|--------|-----|
| Historical panic detection | Pendulum Flow | ✅ Done: `runDipArbBacktest` counts dip opportunities per hour (`scripts/backtest/dip-arb.ts`). (Sparse per-market snapshots: detection is coarser than live 3s polling; the dense `best_bid_ask` stream can refine timing — see §4.5.) |
| DipArb fill simulation | Pendulum Flow | ✅ Done: Leg1 FOK-buy at the ask ladder (VWAP) + Leg2 hedge gated by `sumTarget`, with timeout/stop-loss exits (`src/backtest/dip-arb.ts`). |
| Crypto market price history | poly_data | Open: correlating panic sells with actual crypto moves needs an oracle price feed joined to fills — no consumer in the live bot today. (Mispricing-pattern replay needs the same feed — not covered.) |
| Optimal dip threshold | Pendulum Flow | ✅ Done: CLI `--dip` sweeps thresholds (backtest covers 0.1 vs 0.2); pick the threshold maximizing risk-adjusted returns. |

**Implementation**: Export the market's `book` rows (per §2.1, filter by
`market` blob), convert to snapshots (UP→`yes`, DOWN→`no`), then run
`scripts/backtest/dip-arb.ts`, which mirrors the live Leg1/Leg2/timeout/
stop-loss logic in `src/backtest/dip-arb.ts`. `last_trade_price` rows give
ground-truth prints to check whether the dip was toxic flow.

### 2.3 Smart Money Copy-Trading — Full History Replay

**Current state**: Follows leaderboard wallets with filtering (60%+ WR, 1.5x profit factor, consistency). Backtest now exists: `src/backtest/smart-money.ts`
(discovery + copy-trade simulation from poly_data `trades.csv`), CLI
`scripts/backtest/smart-money.ts`. Validated on synthetic fills.

Real `trades.csv` columns (poly_data v2 README — note `maker_direction` /
`nonusdc_side`, which earlier drafts of this guide omitted): `timestamp`,
`market_id`, `maker`, `taker`, `nonusdc_side` ("token1"/"token2"),
`maker_direction`/`taker_direction` (BUY/SELL), `price`, `usd_amount`,
`token_amount`, `transactionHash`. Filter on `maker` (contract emits from
the maker's perspective).

| Feature | Source | How |
|---------|--------|-----|
| Historical wallet performance | poly_data | ✅ Done: FIFO-match maker fills per (wallet, market, side) into closed lots → WR, PF, PnL, consistency via the repo's existing `computeWalletQualityFromPositions`. |
| Would filtering have worked? | poly_data | ✅ Done: lots feed the live 6-layer gate (`evaluateWalletQuality`, thresholds mirrored from `bot-config.ts`: 60% WR, $500 PnL, 30 trades, 1.5x PF, 0.7 consistency, 0.3 whale cap). |
| Copy-trade P&L simulation | poly_data | ✅ Done: identical fills → same realized PnL minus fee/slippage drag; reports Sharpe, max drawdown, win rate (`summarizeTrades`). |
| Latency impact analysis | poly_data | ✅ Done: `scoreCopyability` per wallet — assumed detection delay vs the live 5s stale guard (`maxStalenessMs`), $10 min copy, side filter (`--delay-ms/--max-stale-ms/--min-copy-usd/--copy-side`); median gap + burst fraction reported as context. Note the live guard skips on print *age*, not on tight inter-fill gaps. Spread/premium/liquidity guards need a live orderbook — not modeled. |
| Market correlation | poly_data | ✅ Done: `src/backtest/correlation.ts` (Jaccard overlap, HHI concentration, crowded markets; CLI `scripts/backtest/correlation.ts`). Real-data run 2026-09-09 (5-day window, 16.46M fills, top-25 makers by volume = 756k fills/$119M): **wallets cluster** — top pair shares 211 markets (J=0.44), another pair shares 3,407 (J=0.34); top whales are **generalists** (2–8.6k markets each, HHI ≤0.012, top-3 share ≤14%); most-crowded market drew 18/25 whales but crowded ≠ profitable (top crowded markets: +$174k vs −$12k combined realized PnL). Discovery on the same slice: 5/15 lot-closing wallets pass the live gate (top: 345 trips, WR 0.99, +$337k). |

Known limits: a maker SELL with no observed prior BUY opens a negative lot
(pipeline is resumable, history can start mid-position — math stays exact);
open inventory is unscored (no resolution data in `trades.csv`). `trades.csv`
covers all markets and is huge — pre-filter to candidate makers first.

**Implementation sketch** (implemented in `src/backtest/smart-money.ts`):

```bash
# Pre-filter the huge trades.csv first, then:
npx tsx scripts/backtest/smart-money.ts data/backtest/poly_trades.csv \
  --top 20 [--maker 0x...] [--fee-bps 0] [--slippage-bps 0]
```

### 2.4 Direct Trading — Snipe & FOK Backtesting

**Current state**: `scripts/trading/` holds two manual utilities (GTC-vs-FOK
order test, order inspector); `examples/08-trading-orders.ts` is a
non-executing demo. "Sniper" (quick buys slightly above market) is
README-only terminology — no sniper code object exists. Stop-loss /
take-profit / trailing-stop / max-hold values live only in
`bot-config.ts` `directTrading` and are never enforced (the live path logs
signals and places a fixed $5 market buy with no exit logic); the only
implemented stop-loss is DipArb's 20%. No systematic backtest.

**What to add:**

| Feature | Source | How |
|---------|--------|-----|
| Snipe execution quality | Pendulum Flow | ✅ Done via FOK rates below: a snipe is an at-touch-or-better FOK, so the pair-fill rate at each size bounds how often it fills entirely. |
| FOK fill rates | Pendulum Flow | ✅ Done: `fokFillRates` (in `src/backtest/availability.ts`, printed by `npm run backtest`) — fraction of depth-carrying snapshots whose BOTH ask ladders hold ≥ size shares, for sizes 5–100. (FOK is real and widespread — arb, DipArb and copy-trading all use it.) |
| Stop-loss / take-profit testing | Pendulum Flow | ✅ Done: `src/backtest/direct.ts` replays the `bot-config.ts` `directTrading` exits (15% stop, 25% TP, 10% trailing, 7-day max hold) on snapshot books — sequential $5 FOK entries, first-trigger exits, exit-reason counts. Entry timing is naive by design (live has no entry signal either). |
| Cross-market arbitrage | Both | ✅ Done: `src/backtest/xmarket.ts` — bucket fills to per-minute VWAP per market, align shared buckets across candidate duplicate pairs, flag \|a−b\| ≥ threshold (CLI `scripts/backtest/xmarket.ts`). Fills normalized to token1-equivalent (token2 → 1−price; a raw run without this flagged 50c phantom diffs). Candidates from grouping `markets.csv` on (question, end, start): 42k raw groups are mostly sports scaffolds, 25k small groups, 120 with ≥2 markets active in-window — but same-question groups mix *different same-day matches* (slugs prove it: `cs2-5s-mglz-…` vs `cs2-mgc-faze-…`), so pairs were restricted to same slug-stem (60 groups / 77 pairs). Real-data result 2026-09-09: **0 divergences ≥2c, max 1.8c** — genuine duplicates track; no cross-market arb in window. |

---

## 3. Architecture

```
poly_data (processed/trades.csv)     Pendulum Flow (hourly parquet)
          |                                    |
          v                                    v
   Wallet trade filter              JSONL snapshot converter
   (Smart Money)                    (Arb, DipArb, Direct)
          |                                    |
          v                                    v
   Per-wallet metrics               Orderbook replay engine
   (WR, PF, consistency)            (existing src/backtest/)
          |                                    |
          +------------------------------------+
                           |
                           v
              Unified backtest report
              (per-strategy, per-market)
```

---

## 4. New Backtest Types

### 4.1 Smart Money Backtest Runner

✅ Implemented (`src/backtest/smart-money.ts`, CLI `scripts/backtest/smart-money.ts`):
1. Parses `trades.csv` (header-driven, skips malformed rows)
2. Discovers all maker addresses, FIFO-matches fills into closed lots
3. Computes per-wallet metrics via existing `computeWalletQualityFromPositions`
4. Applies the live 6-layer gate (`evaluateWalletQuality`)
5. Simulates copy-trading with fee/slippage drag per leg
6. Reports Sharpe ratio, max drawdown, win rate of copied trades

### 4.2 DipArb Backtest Runner

Mirrors the live machine (`detectLeg1Signal` → `executeLeg1` → `detectLeg2Signal`
→ merge/timeout/stop-loss) in `src/backtest/dip-arb.ts`, CLI
`scripts/backtest/dip-arb.ts` (UP→`yes`, DOWN→`no` snapshots):
1. Loads `snapshots.jsonl` for one up/down market (round start = first snapshot)
2. Detects dip signals: side's best-ask drops ≥ `dipThreshold` vs
   `slidingWindowMs` ago, within `windowMinutes` (surge/mispricing skipped:
   surge is disabled live, mispricing needs an oracle)
3. Leg1: FOK-buy `shares` at the ask ladder (VWAP via `fillLadder`)
4. Leg2: on later snapshots, hedge 1:1 when `leg1price + hedgeAsk ≤ sumTarget`;
   else 60s timeout / 20% stop-loss emergency-exits Leg1 at the bid ladder
5. Reports: opportunities, rounds, win rate, avg profit, fill rate, expiries.
   Completed pairs settle at $1 (live `merge()` assumption).

### 4.3 Arb Depth Backtest

✅ Implemented (validated on real hour-06 data):
1. `book` rows → JSONL via `scripts/backtest/pendulum-to-jsonl.ts`
2. Engine walks both ask ladders at VWAP (`fillLadder` in `replay.ts`),
   clamping size to resting depth — no more infinite-liquidity-at-touch
3. Runner reports availability windows (`scanArbAvailability`):
   edge fraction, window count, median/max duration

### 4.5 Touch-Stream Decay Analysis

✅ Implemented (`src/backtest/decay.ts`, CLI `scripts/backtest/decay.ts`,
verified on real hour-06 `best_bid_ask` touches):
1. Export the market's `best_bid_ask` rows (DuckDB SQL in the module header),
   pair same-ms ticks per asset (both asks > 0 required — unpaired ticks dropped)
2. Trace edge episodes (`edge > threshold` opens, first tick at/below closes;
   `>` mirrors `scanArbAvailability`); edge reuses `snapshotEdge` for parity
3. Report median ms-to-decay + per-horizon survival (100ms–5s): is the edge
   still there when our poll would fire?

Real-data note: the probed market showed pair cost ≥ 1.01 on every touch
(max edge −0.01 over 14,960 ticks) — efficient, zero episodes above 1%.
Episode machinery validated on the same ticks against a negative threshold
(7,465 episodes, median decay 35ms: touch flicker mean-reverts fast).

### 4.4 Direct Holder Backtest
✅ Implemented (`src/backtest/direct.ts`, CLI `scripts/backtest/direct.ts`):
1. Sequential round-trips on one side (`--side yes|no`): $5 taker FOK-buy
   at the ask ladder (VWAP, partial fills abort)
2. While open, mark against the top bid; per snapshot, first trigger wins:
   take-profit (25%) → stop-loss (15%) → trailing stop (10% off peak) →
   max-hold expiry (7d) — defaults mirror `bot-config.ts` `directTrading`
3. Exits sell full size into the bid ladder (thin-book remainder worthless)
4. Reports exit-reason counts + standard metrics (`summarizeTrades`)

---

## 5. Setup

### poly_data

```bash
cd /path/to/poly_data
# Set HYPERSYNC_API in .env (free tier from envio.dev)
uv sync
uv run poly-data  # full backfill, resumable
```

Output: `processed/trades.csv`

### Pendulum Flow

Hour files are ~900MB — do NOT bulk-download 24h. Query remotely or fetch
one hour, always filtering to a single market in DuckDB (no auth required):

```bash
# Option A: query the archive directly (DuckDB httpfs, partial reads)
duckdb -c "COPY (SELECT epoch_ms(timestamp) AS ts_ms, hex(market) AS market,
  hex(asset_id) AS asset, bids, asks FROM
  'https://archive.pendulumflow.com/v3/2026-09-09/06/2026-09-09T06.parquet'
  WHERE event_type = 'book' AND market = unhex('<marketHex>')
  ORDER BY timestamp) TO 'rows.json' (FORMAT JSON);"

# Option B: download one hour first (~900MB), then same SELECT locally
curl -O "https://archive.pendulumflow.com/v3/2026-09-09/06/2026-09-09T06.parquet"
```

### Integration

```bash
# In Polymarket-bot project root
mkdir -p data/backtest
ln -s /path/to/poly_data/processed/trades.csv data/backtest/poly_trades.csv
ln -s /path/to/pendulum-flow/parquet/ data/backtest/orderbooks/
```

### Convert to JSONL (for existing backtest harness)

Export `book` rows with DuckDB, then run the converter (no new npm deps —
pairing, touch/ladder logic tested in `src/backtest/pendulum.test.ts`):

```bash
duckdb -c "COPY (SELECT epoch_ms(timestamp) AS ts_ms, hex(market) AS market,
  hex(asset_id) AS asset, bids, asks FROM 'hour.parquet'
  WHERE event_type = 'book' AND market = unhex('<marketHex>')
  ORDER BY timestamp) TO 'rows.json' (FORMAT JSON);"
npx tsx scripts/backtest/pendulum-to-jsonl.ts rows.json snapshots.jsonl \
  --yes <yesAssetHex> --no <noAssetHex> [--max-levels 10]
npm run backtest -- snapshots.jsonl
```

Programmatic use:

```typescript
import { pendulumBookRowsToSnapshots } from "./src/backtest/pendulum.js";
// rows: { ts_ms, market, asset, bids: [{price,size}], asks: [...] }
// asset IDs: hex (any case, 0x-optional) or decimal CTF token IDs
const snapshots = pendulumBookRowsToSnapshots(rows, yesAsset, noAsset, { maxLevels: 10 });
```

---

## 6. Priority

| Task | Impact | Effort | Source | Strategy |
|------|--------|--------|--------|----------|
| Convert Pendulum to JSONL + run existing arb backtest | High | Low | Pendulum Flow | Arbitrage | ✅ Done (real V3 schema, validated hour-06) |
| Smart Money wallet discovery + metrics | High | Low | poly_data | Smart Money | ✅ Done (FIFO lots + live gate, validated synthetic) |
| Smart Money copy-trade simulation | High | Medium | poly_data | Smart Money | ✅ Done (Sharpe/DD/WR, fee drag) |
| DipArb panic detection replay | High | Medium | Pendulum Flow | DipArb | ✅ Done (live-mirror Leg1/Leg2/timeout/SL, validated synthetic; sparse-book caveat) |
| Arb depth-aware fill simulation | Medium | Medium | Pendulum Flow | Arbitrage | ✅ Done (VWAP ladder walks) |
| Direct Trading stop-loss / TP backtest | Medium | Medium | Pendulum Flow | Direct | ✅ Done (config-mirror exits, validated synthetic) |
| Cross-market arb discovery | Low | High | Both | Direct | ✅ Done (VWAP divergence scan, side-normalized; 0 arb in 77 real pairs) |
| Competition analysis (who else arbs?) | Low | Low | poly_data | Arbitrage | ✅ Done (taker HHI + repeat takers + both-sides; 97k real fills: top taker ~48%/mkt, 10 systematic repeat takers) |

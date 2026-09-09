# Upstream Audit Fixes — Tracking File

Source: [MrFadiAi/Polymarket-bot#2](https://github.com/MrFadiAi/Polymarket-bot/issues/2)
(AUDIT: Critical Profitability & Risk Management Issues — still OPEN upstream).

Status verified against our branch `feat/data-sources-backtest` on 2026-09-09.
Legend: ✅ fixed · 🟡 half-fixed · ❌ open.

Fix order (dependencies first): #2 → #4 → #1 → #3-DipArb → #5 → #6.

---

## #1 — Smart Money "strict filters" only 3/6 in dashboard entry point ✅ FIXED (2026-09-09, uncommitted)

- New shared `toWalletQualityGate` mapper in `src/utils/risk.ts` — both app
  entry points build the identical 6/6 gate input (no duplicated mapping).
- New shared `fetchClosedPnls` in `src/utils/closed-positions.ts` (newest-first
  bounded pagination, `realizedPnl` → `cashPnl`) + `closed-positions.test.ts`
  (3 tests). Both entry points score on CLOSED (realized) positions, not open
  mark-to-market ones — newest-first preserves the "recent" contract.
- `bot-config.ts`: `judgeWallet` uses the mapper; both setup loops fetch
  closed positions.
- `bot-with-dashboard.ts`: leaderboard loop replaces the 3-check with the full
  6/6 gate (keeps its pnl/tradeCount sources); custom wallets no longer bypass
  — gated with sample-derived PnL/count, rejections logged.
- Verified: 143/143 tests, tsc clean.

## #2 — Copy-trade profit ALWAYS $0 ✅ FIXED (2026-09-09, uncommitted)

- New `src/services/copy-pnl-tracker.ts`: pure FIFO lot tracker per token
  (live twin of backtest `matchRoundTrips`; shorts symmetric, fees attached).
  + `copy-pnl-tracker.test.ts` (5 tests).
- `smart-money-service.ts`: `AutoCopyTradingOptions.onCopyPnl` callback,
  `AutoCopyTradingStats.realizedPnlUsd`; tracker fed on every executed copy
  (fill price estimated at limit used — documented, not hidden).
- `bot-config.ts`: `onCopyPnl` → `recordTrade(realized, 'smartMoney')`
  instead of `recordTrade(0, ...)`. recordTrade now fires per CLOSE, so
  streaks/PnL are meaningful.
- Verified: 137/137 tests, tsc clean.
- Left as-is (same $0 class, different strategies — follow-up): DipArb
  `recordTrade(0, 'dipArb')` (`bot-config.ts` :651 — service HAS
  `currentRound.profit`, could wire next) and direct `recordTrade(0,
  'direct')` (`bot-with-dashboard.ts` :914).

- `bot-config.ts` :581 `recordTrade(0, 'smartMoney')`; same pattern
  `bot-with-dashboard.ts` :642 (`dipArb`), :914 (`direct`).
- Only arbitrage records real profit (`bot-config.ts` :618,
  `bot-with-dashboard.ts` :509).
- Fix: track copied-trade entries (price/size/time) at copy time, resolve
  realized PnL on exit/close, record that instead of 0. See
  `smart-money-service.ts` `startAutoCopyTrading` onTrade payload for what
  data is available at copy time.

## #3 — Profit calculations ignore gas/fees/slippage ✅ FIXED (2026-09-09, uncommitted)

- Arbitrage ✅ (unchanged): net profit via shared helpers.
- DipArb ✅: completion booking now uses shared `calculateNetLongArbProfit`
  (fee on both legs' notional; no gas term — this path has no gas config,
  documented at the call site). Emergency-exit loss now includes entry-buy +
  exit-sell taker fees (entry fee was never booked either).
- Verified: 143/143 tests, tsc clean.

## #4 — `canTrade()` only protects Direct Trading ✅ FIXED (2026-09-09, uncommitted)

- New shared `RiskIntent` + `PreExecutionGuard` in `src/utils/risk.ts`
  (null = allow, string = block reason). Services describe intent; app decides.
- Guard consulted: arb `execute()` (first, before state), DipArb
  `executeLeg1()` (openers only), copy engine (BUY fills only).
  Rule: hedges/closes/exits NEVER blocked (blocking an exit ↑ risk).
- `bot-config.ts` single `riskGuard` closure → `canOpenPosition` (which
  includes `canTrade()`, Layers 1–6 vs chain-seeded exposure), passed to all
  three execution paths.
- `arbitrage-guard.test.ts` (3 tests) — caught a real bug during dev:
  constructor dropped the new field (fixed).
- Verified: 140/140 tests, tsc clean.
- Note: `trackExposure`/`releaseExposure` still manual-only; enforcement
  works via 60s chain-seeded `refreshExposure`, which is the live source.

- `bot-config.ts` :867 guard sits in `setupDirectTrading` only.
- `canOpenPosition` (:418) + `trackExposure`/`releaseExposure` (:439–447)
  have ZERO callers (dead code). Only `refreshExposure` is wired (:1002,
  60s interval at :1011).
- Fix: call `canOpenPosition`/`trackExposure`/`releaseExposure` from the
  arb / DipArb / copy execution paths (or route them through `canTrade()`),
  not just Direct.

## #5 — `calculatePositionSize()` never called in prod ✅ FIXED (2026-09-09, uncommitted)

- Deleted the dead local adapter in `bot-config.ts` (zero callers; this entry
  point places no orders itself — its Direct path only logs signals).
- Wired the SHARED `calculatePositionSize` into the dashboard live $5 Direct
  buy: size = streak-adjusted fraction × capital, dust floor skips the trade.
  At rest = 0.02 × $250 = $5, identical to the old fixed size.
- Verified: 143/143 tests, tsc clean.

## #6 — Zero on-chain PnL reconciliation ❌

- PnL tracked in-memory only. Closest existing piece: `refreshExposure`
  (exposure, not PnL).
- Fix: periodic job comparing tracked PnL vs on-chain USDC balance delta,
  log/pause on drift. Needs a baseline-balance concept (decide: since bot
  start vs since day start).

## #7 — Zero real arb opportunities in testing (observation, no fix needed)

- Consistent with our real-data backtest (hour-06 top market: 0 edges,
  pair cost ≥ 1.01). Treat as market-efficiency evidence; keep as a
  regression expectation, not a bug.

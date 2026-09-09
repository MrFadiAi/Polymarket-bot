/**
 * Smart Money backtest — wallet discovery + copy-trade simulation from
 * poly_data `processed/trades.csv`.
 *
 * Real trades.csv columns (poly_data v2 README): timestamp, market_id,
 * maker, taker, nonusdc_side ("token1"/"token2"), maker_direction /
 * taker_direction (BUY/SELL), price (USDC per token), usd_amount,
 * token_amount, transactionHash. Filter on `maker`: the contract emits
 * OrderFilled from the maker's perspective.
 *
 * Method: per (wallet, market, side) FIFO matching of maker fills into
 * closed lots. Each closed lot is one realized-PnL observation feeding the
 * repo's existing quality math (`computeWalletQualityFromPositions`) and
 * gate (`evaluateWalletQuality`) — the same 6-layer filter the live bot
 * applies (defaults mirror `bot-config.ts`). Copy-trading takes identical
 * fills, so simulated copy PnL = wallet realized PnL minus per-leg cost
 * drag (fee + slippage bps on bought notional).
 *
 * Assumptions (documented, not hidden):
 * - A maker SELL with no observed prior BUY opens a negative lot. The
 *   pipeline is incremental/resumable, so early history may start mid-
 *   position; symmetric short lots keep the PnL math exact either way.
 * - Open (unclosed) inventory is unscored — no resolution data in trades.csv.
 */

import {
  computeWalletQualityFromPositions,
  evaluateWalletQuality,
  type ComputedWalletQuality,
  type WalletQualityThresholds,
} from '../utils/risk.js';
import { summarizeTrades } from './metrics.js';
import type { BacktestMetrics, BacktestTrade } from './types.js';

/** Live-bot thresholds mirrored from bot-config.ts. */
export const DEFAULT_SM_THRESHOLDS: WalletQualityThresholds = {
  minWinRate: 0.6,
  minPnl: 500,
  minTrades: 30,
  minProfitFactor: 1.5,
  minConsistencyScore: 0.7,
  maxSingleTradeExposure: 0.3,
};

export const DEFAULT_CHECK_LAST_N = 10;

export interface PolyTrade {
  ts: number;
  market_id: string;
  maker: string;
  /** Optional: only parsed when the CSV carries a `taker` column. */
  taker?: string;
  maker_direction: 'BUY' | 'SELL';
  nonusdc_side: string;
  price: number;
  token_amount: number;
}

export interface RoundTrip {
  wallet: string;
  market_id: string;
  openTs: number;
  closeTs: number;
  qty: number;
  buyNotional: number;
  sellNotional: number;
  pnl: number;
}

export interface WalletReport {
  wallet: string;
  fills: number;
  roundTrips: RoundTrip[];
  quality: ComputedWalletQuality;
  gate: { pass: boolean; failures: string[] };
  copy: { trades: BacktestTrade[]; metrics: BacktestMetrics; sharpe: number };
  copyability: CopyabilityScore;
}

/**
 * Copyability model — mirrors the live pre-quote skip reasons in
 * `startAutoCopyTrading` that are answerable from `trades.csv` alone:
 * staleness (`maxStalenessMs`, default 5000), minimum copy value
 * (`minTradeSize`, default $10), and side filter. The live spread/premium/
 * liquidity guards need a contemporaneous orderbook and are NOT modeled.
 *
 * `detectionDelayMs` is the assumed delay between the whale's fill timestamp
 * and the bot acting on it (websocket + processing). The live guard skips
 * when print age exceeds the budget — inter-fill gaps do NOT skip copies,
 * so `medianInterFillMs`/`burstFraction` are reported as burst context only.
 */
export interface CopyabilityOptions {
  detectionDelayMs?: number;
  maxStalenessMs?: number;
  minTradeValueUsd?: number;
  sideFilter?: 'BUY' | 'SELL';
}

export interface CopyabilityScore {
  fills: number;
  copyable: number;
  copyableFraction: number;
  staleSkipped: number;
  sizeSkipped: number;
  sideSkipped: number;
  medianInterFillMs: number;
  /** Share of consecutive-fill gaps within the staleness budget (0 when <2 fills). */
  burstFraction: number;
}

export const DEFAULT_COPYABILITY: Required<Omit<CopyabilityOptions, 'sideFilter'>> & {
  sideFilter?: 'BUY' | 'SELL';
} = {
  detectionDelayMs: 0,
  maxStalenessMs: 5000,
  minTradeValueUsd: 10,
  sideFilter: undefined,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function scoreCopyability(
  fills: PolyTrade[],
  opts: CopyabilityOptions = {}
): CopyabilityScore {
  const o = { ...DEFAULT_COPYABILITY, ...opts };
  const ordered = [...fills].sort((a, b) => a.ts - b.ts);
  let copyable = 0;
  let staleSkipped = 0;
  let sizeSkipped = 0;
  let sideSkipped = 0;
  for (const f of ordered) {
    if (o.detectionDelayMs > o.maxStalenessMs) {
      staleSkipped++;
      continue;
    }
    if (o.sideFilter && f.maker_direction !== o.sideFilter) {
      sideSkipped++;
      continue;
    }
    if (f.price * f.token_amount < o.minTradeValueUsd) {
      sizeSkipped++;
      continue;
    }
    copyable++;
  }
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i++) gaps.push(ordered[i].ts - ordered[i - 1].ts);
  return {
    fills: ordered.length,
    copyable,
    copyableFraction: ordered.length > 0 ? copyable / ordered.length : 0,
    staleSkipped,
    sizeSkipped,
    sideSkipped,
    medianInterFillMs: median(gaps),
    burstFraction:
      gaps.length > 0 ? gaps.filter((g) => g <= o.maxStalenessMs).length / gaps.length : 0,
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parse poly_data trades.csv (header-driven; skips malformed rows). */
export function parsePolyTradesCsv(text: string): PolyTrade[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const idx = (name: string): number => header.indexOf(name);
  const iTs = idx('timestamp');
  const iMkt = idx('market_id');
  const iMaker = idx('maker');
  const iDir = idx('maker_direction');
  const iSide = idx('nonusdc_side');
  const iPrice = idx('price');
  const iQty = idx('token_amount');
  const iTaker = idx('taker');
  if ([iTs, iMkt, iMaker, iDir, iSide, iPrice, iQty].some((i) => i < 0)) {
    throw new Error('trades.csv missing required columns');
  }
  const out: PolyTrade[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    if (c.length <= Math.max(iTs, iMkt, iMaker, iDir, iSide, iPrice, iQty)) continue;
    const ts = Date.parse(c[iTs]);
    const price = Number(c[iPrice]);
    const qty = Number(c[iQty]);
    const dir = c[iDir].toUpperCase();
    if (!Number.isFinite(ts) || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) continue;
    if (dir !== 'BUY' && dir !== 'SELL') continue;
    if (!c[iMaker] || !c[iMkt]) continue;
    out.push({
      ts,
      market_id: c[iMkt],
      maker: c[iMaker].toLowerCase(),
      ...(iTaker >= 0 && c[iTaker] ? { taker: c[iTaker].toLowerCase() } : {}),
      maker_direction: dir,
      nonusdc_side: c[iSide],
      price,
      token_amount: qty,
    });
  }
  return out;
}

interface Lot {
  qty: number;
  price: number;
  openTs: number;
}

/**
 * FIFO-match maker fills into closed lots, grouped by
 * (wallet, market_id, nonusdc_side), time-ordered.
 */
export function matchRoundTrips(trades: PolyTrade[]): RoundTrip[] {
  const groups = new Map<string, PolyTrade[]>();
  for (const t of trades) {
    const k = `${t.maker}|${t.market_id}|${t.nonusdc_side}`;
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const out: RoundTrip[] = [];
  for (const [key, fills] of groups) {
    const [wallet, market_id] = key.split('|');
    fills.sort((a, b) => a.ts - b.ts);
    const lots: Lot[] = [];
    for (const f of fills) {
      let q = f.maker_direction === 'BUY' ? f.token_amount : -f.token_amount;
      while (q !== 0) {
        const top = lots[0];
        if (!top || Math.sign(top.qty) === Math.sign(q)) {
          lots.push({ qty: q, price: f.price, openTs: f.ts });
          q = 0;
        } else {
          const m = Math.min(Math.abs(q), Math.abs(top.qty));
          const buy = top.qty > 0 ? top.price : f.price;
          const sell = top.qty > 0 ? f.price : top.price;
          const pnl = m * (sell - buy);
          out.push({
            wallet,
            market_id,
            openTs: top.openTs,
            closeTs: f.ts,
            qty: m,
            buyNotional: m * buy,
            sellNotional: m * sell,
            pnl,
          });
          top.qty += Math.sign(q) * m;
          q -= Math.sign(q) * m;
          if (top.qty === 0) lots.shift();
        }
      }
    }
  }
  return out.sort((a, b) => a.closeTs - b.closeTs);
}

/** Per-trade Sharpe (risk-free 0); 0 when undefined (n<2 or zero variance). */
export function sharpeRatio(pnls: number[]): number {
  if (pnls.length < 2) return 0;
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length;
  if (!(variance > 0)) return 0;
  return mean / Math.sqrt(variance);
}

export function simulateCopyTrades(
  trips: RoundTrip[],
  opts: { feeBps?: number; slippageBps?: number; gasPerTripUsd?: number } = {}
): { trades: BacktestTrade[]; metrics: BacktestMetrics; sharpe: number } {
  const dragBps = (opts.feeBps ?? 0) + (opts.slippageBps ?? 0);
  const gas = opts.gasPerTripUsd ?? 0;
  const trades: BacktestTrade[] = trips.map((t) => {
    const drag = (t.buyNotional * dragBps) / 10_000;
    const pnl = t.sellNotional - t.buyNotional - drag - gas;
    return {
      ts: t.closeTs,
      type: 'long' as const,
      size: t.qty,
      entryCost: t.buyNotional + drag,
      exitValue: t.sellNotional,
      feeUsd: drag,
      gasUsd: gas,
      pnl,
    };
  });
  return { trades, metrics: summarizeTrades(trades, 0), sharpe: sharpeRatio(trades.map((t) => t.pnl)) };
}

export function walletReport(
  allTrips: RoundTrip[],
  wallet: string,
  opts: {
    thresholds?: WalletQualityThresholds;
    checkLastN?: number;
    feeBps?: number;
    slippageBps?: number;
    /** Maker fills (for the copyability diagnostic); omit only when unavailable. */
    fills?: PolyTrade[];
    copyability?: CopyabilityOptions;
  } = {}
): WalletReport {
  const w = wallet.toLowerCase();
  const trips = allTrips.filter((t) => t.wallet === w);
  // computeWalletQualityFromPositions scores slice(0, N) as "recent", and the
  // live caller feeds newest-first — so reverse these close-time-ascending
  // trips to preserve that contract.
  const quality = computeWalletQualityFromPositions(
    [...trips].reverse().map((t) => ({ cashPnl: t.pnl })),
    opts.checkLastN ?? DEFAULT_CHECK_LAST_N
  );
  const gate = evaluateWalletQuality(
    {
      winRate: quality.winRate,
      pnl: quality.totalPnl,
      tradeCount: quality.tradeCount,
      profitFactor: quality.profitFactor,
      consistencyScore: quality.consistencyScore,
      singleTradeExposure: quality.singleTradeExposure,
    },
    opts.thresholds ?? DEFAULT_SM_THRESHOLDS
  );
  const copy = simulateCopyTrades(trips, opts);
  const fills = (opts.fills ?? []).filter((t) => t.maker === w);
  const copyability = scoreCopyability(fills, opts.copyability);
  return {
    wallet: w,
    fills: fills.length,
    roundTrips: trips,
    quality,
    gate,
    copy,
    copyability,
  };
}

/** Per-wallet reports for every maker in the file, sorted by total PnL desc. */
export function discoverWallets(
  trades: PolyTrade[],
  opts: Parameters<typeof walletReport>[2] = {}
): WalletReport[] {
  const trips = matchRoundTrips(trades);
  const wallets = [...new Set(trips.map((t) => t.wallet))];
  return wallets
    .map((w) => walletReport(trips, w, { ...opts, fills: trades }))
    .sort((a, b) => b.quality.totalPnl - a.quality.totalPnl);
}

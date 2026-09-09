/**
 * Market correlation — do smart-money wallets cluster on the same markets?
 *
 * Inputs are the already-parsed poly_data fills (`PolyTrade`) plus optional
 * closed-lot PnL (`RoundTrip`). Pure functions, zero new deps.
 *
 * Three views:
 * 1. `walletOverlap` — Jaccard similarity of per-wallet market sets. High
 *    overlap pairs fish the same pools (shared signal sources or copy chains).
 * 2. `walletConcentration` — HHI + top-3 share of notional per wallet.
 *    A concentrated winner is a specialist; a diffuse one is a generalist.
 * 3. `crowdedMarkets` — markets ranked by distinct-maker count with combined
 *    realized PnL. The bot should prioritize watching these.
 */

import type { PolyTrade, RoundTrip } from './smart-money.js';

export interface WalletPair {
  walletA: string;
  walletB: string;
  jaccard: number;
  sharedMarkets: number;
  unionMarkets: number;
}

export interface Concentration {
  wallet: string;
  markets: number;
  notionalUsd: number;
  top3Share: number;
  hhi: number;
}

export interface CrowdedMarket {
  market_id: string;
  makers: number;
  fills: number;
  notionalUsd: number;
  realizedPnl: number;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const m of a) if (b.has(m)) shared++;
  return shared / (a.size + b.size - shared);
}

function marketSets(trades: PolyTrade[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const t of trades) {
    let s = out.get(t.maker);
    if (!s) {
      s = new Set();
      out.set(t.maker, s);
    }
    s.add(t.market_id);
  }
  return out;
}

/** Pairwise market-set overlap, most-similar first. */
export function walletOverlap(trades: PolyTrade[]): WalletPair[] {
  const sets = [...marketSets(trades)];
  const out: WalletPair[] = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const [wa, sa] = sets[i];
      const [wb, sb] = sets[j];
      let shared = 0;
      for (const m of sa) if (sb.has(m)) shared++;
      out.push({
        walletA: wa,
        walletB: wb,
        jaccard: jaccard(sa, sb),
        sharedMarkets: shared,
        unionMarkets: sa.size + sb.size - shared,
      });
    }
  }
  return out.sort((x, y) => y.jaccard - x.jaccard);
}

/** Per-wallet market concentration (HHI over notional shares). */
export function walletConcentration(trades: PolyTrade[]): Concentration[] {
  const perWallet = new Map<string, Map<string, number>>();
  for (const t of trades) {
    const notion = t.price * t.token_amount;
    let m = perWallet.get(t.maker);
    if (!m) {
      m = new Map();
      perWallet.set(t.maker, m);
    }
    m.set(t.market_id, (m.get(t.market_id) ?? 0) + notion);
  }
  return [...perWallet]
    .map(([wallet, markets]) => {
      const notionals = [...markets.values()].sort((a, b) => b - a);
      const total = notionals.reduce((s, v) => s + v, 0);
      const hhi = total > 0 ? notionals.reduce((s, v) => s + (v / total) ** 2, 0) : 0;
      const top3 = notionals.slice(0, 3).reduce((s, v) => s + v, 0);
      return {
        wallet,
        markets: markets.size,
        notionalUsd: total,
        top3Share: total > 0 ? top3 / total : 0,
        hhi,
      };
    })
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
}

/**
 * Markets ranked by distinct-maker count. Pass closed lots to attach the
 * combined realized PnL earned there.
 */
export function crowdedMarkets(trades: PolyTrade[], trips: RoundTrip[] = []): CrowdedMarket[] {
  const makers = new Map<string, Set<string>>();
  const fills = new Map<string, number>();
  const notion = new Map<string, number>();
  for (const t of trades) {
    let s = makers.get(t.market_id);
    if (!s) {
      s = new Set();
      makers.set(t.market_id, s);
    }
    s.add(t.maker);
    fills.set(t.market_id, (fills.get(t.market_id) ?? 0) + 1);
    notion.set(t.market_id, (notion.get(t.market_id) ?? 0) + t.price * t.token_amount);
  }
  const pnl = new Map<string, number>();
  for (const r of trips) pnl.set(r.market_id, (pnl.get(r.market_id) ?? 0) + r.pnl);
  return [...makers]
    .map(([market_id, s]) => ({
      market_id,
      makers: s.size,
      fills: fills.get(market_id) ?? 0,
      notionalUsd: notion.get(market_id) ?? 0,
      realizedPnl: pnl.get(market_id) ?? 0,
    }))
    .sort((a, b) => b.makers - a.makers || b.fills - a.fills);
}

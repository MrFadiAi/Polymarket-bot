/**
 * Competition analysis — who else is fishing the same pools?
 *
 * Maker-side crowding (`crowdedMarkets` in correlation.ts) says where the
 * smart-money wallets are. This module profiles the OTHER side of those
 * fills: taker concentration per market (HHI over taker notional), repeat
 * takers across a market set (systematic competitors), and maker↔taker
 * overlap (wallets that both make and take — typically market makers or
 * the same bots working both sides).
 *
 * Inputs are `PolyTrade` rows; rows without a parsed `taker` are ignored.
 * Pure functions, zero new deps.
 */

import type { PolyTrade } from './smart-money.js';

export interface TakerConcentration {
  market_id: string;
  takers: number;
  fills: number;
  notionalUsd: number;
  topTakerShare: number;
  hhi: number;
}

export interface RepeatTaker {
  taker: string;
  markets: number;
  fills: number;
  notionalUsd: number;
}

export interface BothSides {
  wallet: string;
  makerFills: number;
  takerFills: number;
}

function withTaker(trades: PolyTrade[]): PolyTrade[] {
  return trades.filter((t) => t.taker);
}

/** Per-market taker concentration (HHI over taker notional shares). */
export function takerConcentration(trades: PolyTrade[], market_id: string): TakerConcentration | null {
  const notion = new Map<string, number>();
  let fills = 0;
  let total = 0;
  for (const t of withTaker(trades)) {
    if (t.market_id !== market_id) continue;
    const n = t.price * t.token_amount;
    notion.set(t.taker!, (notion.get(t.taker!) ?? 0) + n);
    fills++;
    total += n;
  }
  if (notion.size === 0) return null;
  const sorted = [...notion.values()].sort((a, b) => b - a);
  return {
    market_id,
    takers: notion.size,
    fills,
    notionalUsd: total,
    topTakerShare: total > 0 ? sorted[0] / total : 0,
    hhi: total > 0 ? sorted.reduce((s, v) => s + (v / total) ** 2, 0) : 0,
  };
}

/**
 * Takers active in at least `minMarkets` of the given set, most
 * widespread first. A taker present on every crowded market is competing
 * with us (or supplying us) systematically, not by accident.
 */
export function repeatTakers(
  trades: PolyTrade[],
  marketIds: ReadonlySet<string>,
  minMarkets = 2
): RepeatTaker[] {
  const markets = new Map<string, Set<string>>();
  const fills = new Map<string, number>();
  const notion = new Map<string, number>();
  for (const t of withTaker(trades)) {
    if (!marketIds.has(t.market_id)) continue;
    let s = markets.get(t.taker!);
    if (!s) {
      s = new Set();
      markets.set(t.taker!, s);
    }
    s.add(t.market_id);
    fills.set(t.taker!, (fills.get(t.taker!) ?? 0) + 1);
    notion.set(t.taker!, (notion.get(t.taker!) ?? 0) + t.price * t.token_amount);
  }
  return [...markets]
    .filter(([, s]) => s.size >= minMarkets)
    .map(([taker, s]) => ({
      taker,
      markets: s.size,
      fills: fills.get(taker) ?? 0,
      notionalUsd: notion.get(taker) ?? 0,
    }))
    .sort((a, b) => b.markets - a.markets || b.notionalUsd - a.notionalUsd);
}

/** Addresses appearing as both maker and taker. */
export function makerTakerOverlap(trades: PolyTrade[]): BothSides[] {
  const made = new Map<string, number>();
  const took = new Map<string, number>();
  for (const t of trades) {
    made.set(t.maker, (made.get(t.maker) ?? 0) + 1);
    if (t.taker) took.set(t.taker, (took.get(t.taker) ?? 0) + 1);
  }
  const out: BothSides[] = [];
  for (const [wallet, makerFills] of made) {
    const takerFills = took.get(wallet);
    if (takerFills) out.push({ wallet, makerFills, takerFills });
  }
  return out.sort((a, b) => b.makerFills + b.takerFills - (a.makerFills + a.takerFills));
}

export interface MakerPairBuy {
  maker: string;
  market_id: string;
  /** Non-overlapping windows where both sides were bought. */
  windows: number;
  bestPairCost: number;
  notionalUsd: number;
}

/**
 * Maker-side arb footprint: per (maker, market), greedy non-overlapping
 * windows (default 60s) in which the maker BOUGHT both outcome sides with
 * combined VWAP cost <= `maxPairCost` (default $1 — a sub-$1 YES+NO pair
 * is the long-arb shape). Ranks makers by pair-window count.
 */
export function makerPairBuys(
  trades: PolyTrade[],
  opts: { windowMs?: number; maxPairCost?: number } = {}
): MakerPairBuy[] {
  const windowMs = opts.windowMs ?? 60_000;
  const maxPairCost = opts.maxPairCost ?? 1;
  const groups = new Map<string, PolyTrade[]>();
  for (const t of trades) {
    if (t.maker_direction !== 'BUY') continue;
    const k = `${t.maker}|${t.market_id}`;
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const out: MakerPairBuy[] = [];
  for (const [key, fills] of groups) {
    fills.sort((a, b) => a.ts - b.ts);
    const [maker, market_id] = key.split('|');
    let windows = 0;
    let bestPairCost = Number.POSITIVE_INFINITY;
    let notionalUsd = 0;
    let i = 0;
    while (i < fills.length) {
      const sides = new Map<string, { qty: number; notion: number }>();
      let j = i;
      while (j < fills.length && fills[j].ts - fills[i].ts <= windowMs) {
        const s = sides.get(fills[j].nonusdc_side) ?? { qty: 0, notion: 0 };
        s.qty += fills[j].token_amount;
        s.notion += fills[j].price * fills[j].token_amount;
        sides.set(fills[j].nonusdc_side, s);
        j++;
      }
      if (sides.size >= 2) {
        const costs = [...sides.values()].map((s) => s.notion / s.qty);
        const pairCost = costs[0] + costs[1];
        if (pairCost <= maxPairCost) {
          windows++;
          if (pairCost < bestPairCost) bestPairCost = pairCost;
          notionalUsd += [...sides.values()].reduce((s, v) => s + v.notion, 0);
          i = j;
          continue;
        }
      }
      i++;
    }
    if (windows > 0) {
      out.push({ maker, market_id, windows, bestPairCost, notionalUsd });
    }
  }
  return out.sort((a, b) => b.windows - a.windows || b.notionalUsd - a.notionalUsd);
}

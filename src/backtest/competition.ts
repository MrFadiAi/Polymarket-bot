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

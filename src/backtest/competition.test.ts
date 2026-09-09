import { describe, it, expect } from 'vitest';
import { parsePolyTradesCsv } from './smart-money.js';
import { takerConcentration, repeatTakers, makerTakerOverlap } from './competition.js';

const HEADER =
  'timestamp,market_id,maker,taker,nonusdc_side,maker_direction,taker_direction,price,usd_amount,token_amount,transactionHash';

function row(ts: string, mkt: string, maker: string, taker: string, price: number, qty: number): string {
  return `${ts},${mkt},${maker},${taker},token1,BUY,SELL,${price},${price * qty},${qty},0xh`;
}

const T = '2026-01-01T00:00:00Z';

describe('takerConcentration', () => {
  it('computes HHI and top share per market', () => {
    const trades = parsePolyTradesCsv(
      [
        HEADER,
        row(T, 'm1', '0xa', '0xt1', 0.5, 100), // 50
        row(T, 'm1', '0xb', '0xt1', 0.5, 100), // 50
        row(T, 'm1', '0xc', '0xt2', 0.5, 100), // 50
      ].join('\n')
    );
    const c = takerConcentration(trades, 'm1')!;
    expect(c.takers).toBe(2);
    expect(c.fills).toBe(3);
    expect(c.topTakerShare).toBeCloseTo(2 / 3, 10);
    expect(c.hhi).toBeCloseTo((2 / 3) ** 2 + (1 / 3) ** 2, 10);
  });

  it('returns null for unknown markets and ignores taker-less rows', () => {
    const trades = parsePolyTradesCsv([HEADER, row(T, 'm1', '0xa', '0xt1', 0.5, 100)].join('\n'));
    expect(takerConcentration(trades, 'nope')).toBeNull();
    const noTaker = parsePolyTradesCsv(
      ['timestamp,market_id,maker,nonusdc_side,maker_direction,price,token_amount', `${T},m1,0xa,token1,BUY,0.5,100`].join('\n')
    );
    expect(noTaker[0].taker).toBeUndefined();
    expect(takerConcentration(noTaker, 'm1')).toBeNull();
  });
});

describe('repeatTakers', () => {
  it('finds takers spread across markets', () => {
    const trades = parsePolyTradesCsv(
      [
        HEADER,
        row(T, 'm1', '0xa', '0xbot', 0.5, 100),
        row(T, 'm2', '0xb', '0xbot', 0.5, 100),
        row(T, 'm3', '0xc', '0xbot', 0.5, 100),
        row(T, 'm1', '0xa', '0xonce', 0.5, 100),
      ].join('\n')
    );
    const reps = repeatTakers(trades, new Set(['m1', 'm2', 'm3']), 2);
    expect(reps).toHaveLength(1);
    expect(reps[0].taker).toBe('0xbot');
    expect(reps[0].markets).toBe(3);
  });
});

describe('makerTakerOverlap', () => {
  it('finds wallets on both sides', () => {
    const trades = parsePolyTradesCsv(
      [
        HEADER,
        row(T, 'm1', '0xboth', '0xt1', 0.5, 100),
        row(T, 'm1', '0xa', '0xboth', 0.5, 100),
        row(T, 'm1', '0xt1', '0xa', 0.5, 100),
      ].join('\n')
    );
    const overlap = makerTakerOverlap(trades);
    expect(overlap.map((o) => o.wallet).sort()).toEqual(['0xa', '0xboth', '0xt1']);
  });
});

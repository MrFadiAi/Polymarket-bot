import { describe, it, expect } from 'vitest';
import { parsePolyTradesCsv, matchRoundTrips } from './smart-money.js';
import { jaccard, walletOverlap, walletConcentration, crowdedMarkets } from './correlation.js';

const HEADER =
  'timestamp,market_id,maker,taker,nonusdc_side,maker_direction,taker_direction,price,usd_amount,token_amount,transactionHash';

function leg(mkt: string, maker: string, dir: string, price: number, qty: number, day: string): string {
  const t = `${day}T00:00:00Z`;
  return `${t},${mkt},${maker},0xt,token1,${dir},${dir === 'BUY' ? 'SELL' : 'BUY'},${price},${price * qty},${qty},0xh`;
}

const A = '0xaaa';
const B = '0xbbb';
const C = '0xccc';

// A: m1+m2, B: m2+m3 (shares m2), C: m9 alone.
const CSV = [
  HEADER,
  leg('m1', A, 'BUY', 0.4, 100, '2026-01-01'),
  leg('m1', A, 'SELL', 0.6, 100, '2026-01-01'),
  leg('m2', A, 'BUY', 0.5, 100, '2026-01-02'),
  leg('m2', A, 'SELL', 0.7, 100, '2026-01-02'),
  leg('m2', B, 'BUY', 0.5, 200, '2026-01-02'),
  leg('m2', B, 'SELL', 0.6, 200, '2026-01-02'),
  leg('m3', B, 'BUY', 0.4, 50, '2026-01-03'),
  leg('m3', B, 'SELL', 0.5, 50, '2026-01-03'),
  leg('m9', C, 'BUY', 0.4, 10, '2026-01-04'),
  leg('m9', C, 'SELL', 0.3, 10, '2026-01-04'),
].join('\n');

describe('jaccard', () => {
  it('is 1 for identical sets, 0 for disjoint or empty', () => {
    expect(jaccard(new Set(['a']), new Set(['a']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});

describe('walletOverlap', () => {
  it('ranks the sharing pair first', () => {
    const pairs = walletOverlap(parsePolyTradesCsv(CSV));
    expect(pairs).toHaveLength(3);
    expect(pairs[0].walletA).toBe(A);
    expect(pairs[0].walletB).toBe(B);
    expect(pairs[0].sharedMarkets).toBe(1);
    expect(pairs[0].jaccard).toBeCloseTo(1 / 3, 10);
    expect(pairs[1].jaccard).toBe(0);
  });
});

describe('walletConcentration', () => {
  it('computes HHI and top-3 share', () => {
    const conc = walletConcentration(parsePolyTradesCsv(CSV));
    const a = conc.find((c) => c.wallet === A)!;
    // A notionals: m1: 40+60=100, m2: 50+70=120 → total 220
    expect(a.markets).toBe(2);
    expect(a.notionalUsd).toBeCloseTo(220, 10);
    expect(a.top3Share).toBe(1);
    expect(a.hhi).toBeCloseTo((100 / 220) ** 2 + (120 / 220) ** 2, 10);
  });
});

describe('crowdedMarkets', () => {
  it('ranks m2 first with combined PnL', () => {
    const trades = parsePolyTradesCsv(CSV);
    const top = crowdedMarkets(trades, matchRoundTrips(trades));
    expect(top[0].market_id).toBe('m2');
    expect(top[0].makers).toBe(2);
    expect(top[0].fills).toBe(4);
    // A: 100*(0.7-0.5)=20, B: 200*(0.6-0.5)=20
    expect(top[0].realizedPnl).toBeCloseTo(40, 8);
  });

  it('works without trips (PnL 0)', () => {
    const top = crowdedMarkets(parsePolyTradesCsv(CSV));
    expect(top[0].realizedPnl).toBe(0);
  });
});

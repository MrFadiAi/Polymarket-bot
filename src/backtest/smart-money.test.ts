import { describe, it, expect } from 'vitest';
import {
  parsePolyTradesCsv,
  matchRoundTrips,
  discoverWallets,
  simulateCopyTrades,
  scoreCopyability,
  sharpeRatio,
  DEFAULT_SM_THRESHOLDS,
} from './smart-money.js';

const HEADER =
  'timestamp,market_id,maker,taker,nonusdc_side,maker_direction,taker_direction,price,usd_amount,token_amount,transactionHash';

function row(
  ts: string,
  maker: string,
  dir: string,
  price: number,
  qty: number,
  mkt = 'm1',
  side = 'token1'
): string {
  return `${ts},${mkt},${maker},0xtaker,${side},${dir},${dir === 'BUY' ? 'SELL' : 'BUY'},${price},${price * qty},${qty},0xhash`;
}

const A = '0xaaaa';
const B = '0xbbbb';

describe('parsePolyTradesCsv', () => {
  it('parses rows and skips malformed ones', () => {
    const csv = [
      HEADER,
      row('2026-01-01T00:00:00Z', A, 'BUY', 0.4, 10),
      'bad,row',
      row('2026-01-01T00:01:00Z', A, 'HOLD', 0.5, 10),
      row('2026-01-01T00:02:00Z', A, 'SELL', 0.7, 10),
    ].join('\n');
    const trades = parsePolyTradesCsv(csv);
    expect(trades).toHaveLength(2);
    expect(trades[0].maker).toBe(A);
    expect(trades[0].ts).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('throws when required columns are missing', () => {
    expect(() => parsePolyTradesCsv('foo,bar\n1,2')).toThrow();
  });
});

describe('matchRoundTrips', () => {
  it('FIFO-matches buys and sells into realized PnL', () => {
    const trades = parsePolyTradesCsv(
      [
        HEADER,
        row('2026-01-01T00:00:00Z', A, 'BUY', 0.4, 10),
        row('2026-01-01T00:01:00Z', A, 'BUY', 0.6, 10),
        row('2026-01-01T00:02:00Z', A, 'SELL', 0.7, 20),
      ].join('\n')
    );
    const trips = matchRoundTrips(trades);
    expect(trips).toHaveLength(2);
    expect(trips.reduce((s, t) => s + t.pnl, 0)).toBeCloseTo(10 * 0.3 + 10 * 0.1, 10);
  });

  it('handles sells with no prior buys as short lots', () => {
    const trades = parsePolyTradesCsv(
      [
        HEADER,
        row('2026-01-01T00:00:00Z', A, 'SELL', 0.6, 10),
        row('2026-01-01T00:01:00Z', A, 'BUY', 0.4, 10),
      ].join('\n')
    );
    const trips = matchRoundTrips(trades);
    expect(trips).toHaveLength(1);
    expect(trips[0].pnl).toBeCloseTo(2, 10);
  });

  it('keeps markets and wallets separate', () => {
    const trades = parsePolyTradesCsv(
      [
        HEADER,
        row('2026-01-01T00:00:00Z', A, 'BUY', 0.4, 10, 'm1'),
        row('2026-01-01T00:01:00Z', A, 'BUY', 0.4, 10, 'm2'),
        row('2026-01-01T00:02:00Z', B, 'BUY', 0.4, 10, 'm1'),
      ].join('\n')
    );
    // No sells → no closed trips
    expect(matchRoundTrips(trades)).toHaveLength(0);
  });
});

describe('discoverWallets', () => {
  function winnerCsv(wallet: string, n: number, pnlEach: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`;
      out.push(row(t, wallet, 'BUY', 0.4, 100));
      out.push(row(t, wallet, 'SELL', 0.4 + pnlEach / 100, 100));
    }
    return out;
  }

  it('passes a consistent winner through the live gate, fails a light wallet', () => {
    const csv = [HEADER, ...winnerCsv(A, 35, 20), ...winnerCsv(B, 5, 20)].join('\n');
    const reports = discoverWallets(parsePolyTradesCsv(csv));
    expect(reports).toHaveLength(2);
    // Sorted by PnL desc; A has 35*20=700, B has 5*20=100
    expect(reports[0].wallet).toBe(A);
    expect(reports[0].quality.totalPnl).toBeCloseTo(700, 8);
    expect(reports[0].quality.winRate).toBe(1);
    expect(reports[0].gate.pass).toBe(true);
    expect(reports[1].gate.pass).toBe(false);
    expect(reports[1].gate.failures.join(' ')).toMatch(/Trades/);
  });

  it('flags whale-dominated PnL', () => {
    const lines = [HEADER];
    for (let i = 0; i < 30; i++) {
      const t = `2026-01-02T00:${String(i).padStart(2, '0')}:00Z`;
      const qty = i === 0 ? 10000 : 10;
      lines.push(row(t, A, 'BUY', 0.4, qty));
      lines.push(row(t, A, 'SELL', 0.5, qty));
    }
    const [report] = discoverWallets(parsePolyTradesCsv(lines.join('\n')));
    expect(report.quality.singleTradeExposure).toBeGreaterThan(0.3);
    expect(report.gate.pass).toBe(false);
  });
});

describe('simulateCopyTrades', () => {
  it('mirrors wallet PnL minus cost drag and reports Sharpe', () => {
    const csv = [
      HEADER,
      row('2026-01-01T00:00:00Z', A, 'BUY', 0.4, 10),
      row('2026-01-01T00:01:00Z', A, 'SELL', 0.6, 10),
      row('2026-01-01T00:02:00Z', A, 'BUY', 0.5, 10),
      row('2026-01-01T00:03:00Z', A, 'SELL', 0.6, 10),
    ].join('\n');
    const [report] = discoverWallets(parsePolyTradesCsv(csv));
    expect(report.copy.metrics.trades).toBe(2);
    expect(report.copy.metrics.totalPnl).toBeCloseTo(2 + 1, 10);
    expect(report.copy.sharpe).toBeGreaterThan(0);
    const dragged = simulateCopyTrades(report.roundTrips, { feeBps: 100 });
    expect(dragged.metrics.totalPnl).toBeLessThan(report.copy.metrics.totalPnl);
  });

  it('sharpeRatio is 0 for degenerate inputs', () => {
    expect(sharpeRatio([])).toBe(0);
    expect(sharpeRatio([1])).toBe(0);
    expect(sharpeRatio([1, 1, 1])).toBe(0);
  });
});

describe('DEFAULT_SM_THRESHOLDS', () => {
  it('mirrors the live bot gate', () => {
    expect(DEFAULT_SM_THRESHOLDS).toEqual({
      minWinRate: 0.6,
      minPnl: 500,
      minTrades: 30,
      minProfitFactor: 1.5,
      minConsistencyScore: 0.7,
      maxSingleTradeExposure: 0.3,
    });
  });
});

describe('scoreCopyability', () => {
  const csv = [
    HEADER,
    row('2026-01-01T00:00:00Z', A, 'BUY', 0.4, 100), // $40 value
    row('2026-01-01T00:00:02Z', A, 'BUY', 0.4, 100), // 2s gap (burst)
    row('2026-01-01T00:01:00Z', A, 'SELL', 0.6, 100),
    row('2026-01-01T00:02:00Z', A, 'BUY', 0.4, 1), // $0.40 — below $10 min
  ].join('\n');

  it('passes everything under zero assumed delay except dust', () => {
    const s = scoreCopyability(parsePolyTradesCsv(csv));
    expect(s.fills).toBe(4);
    expect(s.copyable).toBe(3);
    expect(s.sizeSkipped).toBe(1);
    expect(s.staleSkipped).toBe(0);
    expect(s.copyableFraction).toBeCloseTo(0.75, 10);
  });

  it('stale-skips everything when the delay exceeds the live 5s budget', () => {
    const s = scoreCopyability(parsePolyTradesCsv(csv), { detectionDelayMs: 6000 });
    expect(s.staleSkipped).toBe(4);
    expect(s.copyable).toBe(0);
  });

  it('applies the live side filter', () => {
    const s = scoreCopyability(parsePolyTradesCsv(csv), {
      sideFilter: 'SELL',
      minTradeValueUsd: 0,
    });
    expect(s.copyable).toBe(1);
    expect(s.sideSkipped).toBe(3);
  });

  it('reports gap stats as burst context, not skip reasons', () => {
    const s = scoreCopyability(parsePolyTradesCsv(csv));
    // gaps: 2s, 58s, 60s → median 58s, 1/3 within the 5s budget
    expect(s.medianInterFillMs).toBe(58_000);
    expect(s.burstFraction).toBeCloseTo(1 / 3, 10);
  });

  it('handles empty input', () => {
    expect(scoreCopyability([])).toMatchObject({
      fills: 0,
      copyable: 0,
      copyableFraction: 0,
      medianInterFillMs: 0,
      burstFraction: 0,
    });
  });

  it('discoverWallets attaches per-wallet copyability', () => {
    const [report] = discoverWallets(parsePolyTradesCsv(csv));
    expect(report.fills).toBe(4);
    expect(report.copyability.copyable).toBe(3);
  });
});

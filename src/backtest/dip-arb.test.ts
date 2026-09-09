import { describe, it, expect } from 'vitest';
import { runDipArbBacktest, type DipArbConfig } from './dip-arb.js';
import type { BacktestSnapshot } from './types.js';

function snap(
  ts: number,
  yesAsk: number,
  noAsk: number,
  opts: { yesBid?: number; noBid?: number; depth?: number } = {}
): BacktestSnapshot {
  const ask = (p: number): [{ price: number; size: number }] =>
    [{ price: p, size: opts.depth ?? 1000 }];
  return {
    ts,
    yesAsk,
    yesBid: opts.yesBid ?? yesAsk - 0.02,
    noAsk,
    noBid: opts.noBid ?? noAsk - 0.02,
    levels: {
      yesAsks: ask(yesAsk),
      yesBids: [{ price: opts.yesBid ?? yesAsk - 0.02, size: opts.depth ?? 1000 }],
      noAsks: ask(noAsk),
      noBids: [{ price: opts.noBid ?? noAsk - 0.02, size: opts.depth ?? 1000 }],
    },
  };
}

const CFG: DipArbConfig = {
  dipThreshold: 0.15,
  slidingWindowMs: 3000,
  windowMinutes: 2,
  sumTarget: 0.92,
  leg2TimeoutSeconds: 60,
  stopLossPct: 0.2,
  shares: 20,
};

describe('runDipArbBacktest', () => {
  it('completes the hedged pair when the hedge fits sumTarget', () => {
    const snaps = [
      snap(0, 0.5, 0.5),
      snap(3500, 0.4, 0.5), // 20% dip vs t=0 (>= 15%, 3s lookback) → Leg1 YES @0.40
      snap(13_000, 0.4, 0.45), // 0.40 + 0.45 = 0.85 <= 0.92 → Leg2
    ];
    const r = runDipArbBacktest(snaps, CFG);
    expect(r.signals).toBe(1);
    expect(r.rounds).toHaveLength(1);
    expect(r.rounds[0].status).toBe('completed');
    expect(r.rounds[0].side).toBe('yes');
    expect(r.rounds[0].pnl).toBeCloseTo(20 * (1 - 0.85), 10);
    expect(r.metrics.trades).toBe(1);
    expect(r.metrics.totalPnl).toBeCloseTo(3, 10);
  });

  it('aborts Leg1 on thin book (FOK) without opening a round', () => {
    const snaps = [
      snap(0, 0.5, 0.5),
      snap(3500, 0.4, 0.5, { depth: 5 }), // dip, but only 5 resting < 20 shares
      snap(13_000, 0.4, 0.45),
    ];
    const r = runDipArbBacktest(snaps, CFG);
    expect(r.signals).toBe(1);
    expect(r.rounds).toHaveLength(0);
  });

  it('expires at timeout when no hedge appears', () => {
    const snaps = [
      snap(0, 0.5, 0.5),
      snap(3500, 0.4, 0.5), // Leg1 YES @0.40
      snap(30_000, 0.4, 0.6), // 0.40+0.60=1.00 > 0.92, no stop (< 20% off bid)
      snap(70_000, 0.4, 0.6), // > 60s after Leg1 → expired, exit @ bid 0.38
    ];
    const r = runDipArbBacktest(snaps, CFG);
    expect(r.rounds).toHaveLength(1);
    expect(r.rounds[0].status).toBe('expired');
    // exit 20 @ 0.38, entry 20 @ 0.40 → -0.40
    expect(r.rounds[0].pnl).toBeCloseTo(-0.4, 10);
  });

  it('stop-losses when the bid collapses after Leg1', () => {
    const snaps = [
      snap(0, 0.5, 0.5),
      snap(3500, 0.4, 0.5), // Leg1 YES @0.40
      snap(4500, 0.4, 0.6, { yesBid: 0.3 }), // (0.40-0.30)/0.40 = 25% ≥ 20%
    ];
    const r = runDipArbBacktest(snaps, CFG);
    expect(r.rounds).toHaveLength(1);
    expect(r.rounds[0].status).toBe('stopped');
    expect(r.rounds[0].pnl).toBeCloseTo(20 * (0.3 - 0.4), 10);
  });

  it('ignores dips outside the activity window', () => {
    const snaps = [
      snap(0, 0.5, 0.5),
      snap(3500, 0.5, 0.5),
      snap(200_000, 0.4, 0.5), // dip, but > 2min after round start
    ];
    const r = runDipArbBacktest(snaps, CFG);
    expect(r.signals).toBe(0);
    expect(r.rounds).toHaveLength(0);
  });

  it('supports threshold sweeps (guide §2.2 optimal-threshold row)', () => {
    const snaps = [
      snap(0, 0.5, 0.5),
      snap(3500, 0.44, 0.5), // 12% dip
      snap(13_000, 0.44, 0.45),
    ];
    const loose = runDipArbBacktest(snaps, { ...CFG, dipThreshold: 0.1 });
    const strict = runDipArbBacktest(snaps, { ...CFG, dipThreshold: 0.2 });
    expect(loose.signals).toBe(1);
    expect(strict.signals).toBe(0);
  });

  it('is a no-op on empty input', () => {
    const r = runDipArbBacktest([], CFG);
    expect(r).toEqual({ signals: 0, rounds: [], trades: [], metrics: expect.anything() });
    expect(r.metrics.trades).toBe(0);
  });
});

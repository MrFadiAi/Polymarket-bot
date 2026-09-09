import { describe, it, expect } from 'vitest';
import {
  pendulumBookRowsToSnapshots,
  parseBookRowsText,
  normalizeAssetId,
  assetHexToTokenId,
  snapshotsToJsonl,
  type PendulumBookRow,
} from './pendulum.js';
import { scanArbAvailability } from './availability.js';
import { parseSnapshotsJsonl, runBacktest, longArbStrategy, fillLadder } from './replay.js';

const YES = 'aa'.repeat(32);
const NO = 'bb'.repeat(32);

function bookRow(ts: number, asset: string, bids: number[][], asks: number[][]): PendulumBookRow {
  return {
    ts_ms: ts,
    market: 'cc'.repeat(32),
    asset,
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
  };
}

describe('pendulumBookRowsToSnapshots', () => {
  it('pairs same-ts rows and takes touch from ladder tops', () => {
    const snaps = pendulumBookRowsToSnapshots(
      [
        bookRow(1000, YES, [[0.44, 100]], [[0.45, 7], [0.5, 50]]),
        bookRow(1000, NO, [[0.44, 100]], [[0.46, 9]]),
      ],
      YES,
      NO
    );
    expect(snaps).toHaveLength(1);
    expect(snaps[0].ts).toBe(1000);
    expect(snaps[0].yesAsk).toBe(0.45);
    expect(snaps[0].yesAskSize).toBe(7);
    expect(snaps[0].noAsk).toBe(0.46);
    expect(snaps[0].levels?.yesAsks).toHaveLength(2);
  });

  it('accepts uppercase hex and decimal token IDs', () => {
    const dec = assetHexToTokenId(YES);
    expect(dec).toMatch(/^\d+$/);
    const snaps = pendulumBookRowsToSnapshots(
      [bookRow(1000, YES.toUpperCase(), [], [[0.45, 7]]), bookRow(1000, NO, [], [[0.45, 7]])],
      dec,
      `0x${NO.toUpperCase()}`
    );
    expect(snaps).toHaveLength(1);
  });

  it('skips buckets missing an asset or an ask ladder', () => {
    expect(
      pendulumBookRowsToSnapshots([bookRow(1000, YES, [], [[0.45, 7]])], YES, NO)
    ).toHaveLength(0);
    // Empty books on both sides
    expect(
      pendulumBookRowsToSnapshots(
        [bookRow(1000, YES, [], []), bookRow(1000, NO, [], [])],
        YES,
        NO
      )
    ).toHaveLength(0);
    // One side missing asks
    expect(
      pendulumBookRowsToSnapshots(
        [bookRow(1000, YES, [[0.4, 1]], []), bookRow(1000, NO, [], [[0.45, 7]])],
        YES,
        NO
      )
    ).toHaveLength(0);
  });

  it('caps depth at maxLevels', () => {
    const asks = Array.from({ length: 30 }, (_, i) => [0.4 + i * 0.01, 1]);
    const snaps = pendulumBookRowsToSnapshots(
      [bookRow(1000, YES, [], asks), bookRow(1000, NO, [], [[0.4, 100]])],
      YES,
      NO,
      { maxLevels: 5 }
    );
    expect(snaps[0].levels?.yesAsks).toHaveLength(5);
  });
});

describe('normalizeAssetId', () => {
  it('round-trips decimal through hex', () => {
    expect(normalizeAssetId(assetHexToTokenId(YES))).toBe(YES);
  });
});

describe('parseBookRowsText', () => {
  const row = bookRow(1000, YES, [], [[0.45, 7]]);
  it('parses NDJSON (DuckDB COPY ... FORMAT JSON)', () => {
    expect(parseBookRowsText(`${JSON.stringify(row)}\n${JSON.stringify(row)}\n`)).toHaveLength(2);
  });
  it('parses a JSON array', () => {
    expect(parseBookRowsText(JSON.stringify([row]))).toHaveLength(1);
  });
  it('returns [] for blank input and throws on invalid JSON', () => {
    expect(parseBookRowsText('  \n ')).toEqual([]);
    expect(() => parseBookRowsText('not json')).toThrow();
  });
});

describe('depth-aware fills', () => {
  it('fillLadder walks levels at VWAP', () => {
    const { filled, notional } = fillLadder(
      [
        { price: 0.4, size: 5 },
        { price: 0.5, size: 10 },
      ],
      10
    );
    expect(filled).toBe(10);
    expect(notional).toBeCloseTo(0.4 * 5 + 0.5 * 5, 10);
  });

  it('clamps size to resting depth and prices at VWAP, not touch', () => {
    const snaps = pendulumBookRowsToSnapshots(
      [
        bookRow(1000, YES, [], [[0.4, 5], [0.5, 100]]),
        bookRow(1000, NO, [], [[0.4, 5], [0.5, 100]]),
      ],
      YES,
      NO
    );
    const parsed = parseSnapshotsJsonl(snapshotsToJsonl(snaps));
    expect(parsed[0].levels).toBeDefined();
    const { trades } = runBacktest(parsed, (s, i) => longArbStrategy(s, i), {
      gasCostUsd: 0,
      maxTradeSize: 10,
    });
    expect(trades).toHaveLength(1);
    expect(trades[0].size).toBe(10);
    // VWAP per leg: (0.4*5 + 0.5*5)/10 = 0.45 → entry 9, pnl 1.
    // Touch-only model would claim entry 8, pnl 2.
    expect(trades[0].entryCost).toBeCloseTo(9, 10);
    expect(trades[0].pnl).toBeCloseTo(1, 10);
  });
});

describe('scanArbAvailability', () => {
  it('groups consecutive edge snapshots into windows', () => {
    const mk = (ts: number, cost: number) => ({
      ts,
      yesAsk: cost / 2,
      yesBid: 0,
      noAsk: cost / 2,
      noBid: 0,
    });
    const avail = scanArbAvailability(
      [mk(1000, 0.9), mk(2000, 0.92), mk(3000, 1.0), mk(4000, 0.9)],
      { profitThreshold: 0.005 }
    );
    expect(avail.snapshots).toBe(4);
    expect(avail.edgeSnapshots).toBe(3);
    expect(avail.edgeFraction).toBeCloseTo(0.75, 10);
    expect(avail.windows).toHaveLength(2);
    expect(avail.windows[0].durationMs).toBe(1000);
    expect(avail.windows[1].durationMs).toBe(0);
    expect(avail.medianWindowMs).toBe(500);
    expect(avail.maxEdge).toBeCloseTo(0.1, 10);
  });
});

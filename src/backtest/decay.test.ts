import { describe, it, expect } from 'vitest';
import {
  parseTouchRowsText,
  touchRowsToTicks,
  traceEdgeEpisodes,
  summarizeDecay,
  DEFAULT_DECAY_HORIZONS_MS,
  type PendulumTouchRow,
} from './decay.js';

const YES = 'c4969108d3ca216e51619a84cacbc7c9a60c0a14524be87dba9761f52ad20e66';
const NO = 'b526004a31c1853f724ddb70a1f92411d1e73d52092ef4ba6cc5118c9e3dc29c';

function row(ts: number, asset: string, bid: number | null, ask: number | null): PendulumTouchRow {
  return { ts_ms: ts, market: 'm', asset, best_bid: bid, best_ask: ask };
}

/** Ticks at 50ms cadence with a given edge series (yesAsk+noAsk = 1-edge). */
function edgesToTicks(edges: number[]): string {
  return edges
    .map((e, i) => {
      const ts = i * 50;
      const yesAsk = 0.4;
      const noAsk = 1 - e - yesAsk;
      return [
        JSON.stringify({ ts_ms: ts, market: 'm', asset: YES, best_bid: 0.39, best_ask: yesAsk }),
        JSON.stringify({ ts_ms: ts, market: 'm', asset: NO, best_bid: 0.5, best_ask: noAsk }),
      ].join('\n');
    })
    .join('\n');
}

describe('parseTouchRowsText', () => {
  it('parses NDJSON and arrays, rejects garbage', () => {
    const nd = [JSON.stringify(row(1, YES, 0.9, 0.92)), JSON.stringify(row(1, NO, 0.08, 0.1))].join('\n');
    expect(parseTouchRowsText(nd)).toHaveLength(2);
    expect(parseTouchRowsText(JSON.stringify([row(1, YES, 0.9, 0.92)]))).toHaveLength(1);
    expect(parseTouchRowsText('  ')).toEqual([]);
    expect(() => parseTouchRowsText('{bad json')).toThrow();
  });
});

describe('touchRowsToTicks', () => {
  it('pairs same-ms rows and prices the edge at the touch', () => {
    const ticks = touchRowsToTicks(parseTouchRowsText(edgesToTicks([0.05])), YES, NO);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].edge).toBeCloseTo(0.05, 10);
  });

  it('drops unpaired ticks and buckets missing an ask', () => {
    const rows = [
      row(0, YES, 0.9, 0.92), // no NO row at ts 0 → dropped
      row(50, YES, 0.9, 0.92),
      row(50, NO, 0.08, 0), // zero ask → dropped
      row(100, YES, 0.9, null), // null ask → dropped
      row(100, NO, 0.08, 0.1),
    ];
    expect(touchRowsToTicks(rows, YES, NO)).toHaveLength(0);
  });
});

describe('traceEdgeEpisodes', () => {
  it('measures ms until the edge first drops to/below threshold', () => {
    // edge 0.05 for 6 ticks (0–250ms), then 0 at 300ms
    const ticks = touchRowsToTicks(
      parseTouchRowsText(edgesToTicks([0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0])),
      YES,
      NO
    );
    const [ep] = traceEdgeEpisodes(ticks, { threshold: 0.01, horizonsMs: [100, 1000] });
    expect(ep.startEdge).toBeCloseTo(0.05, 10);
    expect(ep.decayMs).toBe(300);
    expect(ep.edgeAtHorizon[0]).toBeCloseTo(0.05, 10); // +100ms still alive
    expect(ep.edgeAtHorizon[1]).toBeNaN(); // +1000ms past EOF
  });

  it('leaves decayMs null when the edge survives to EOF', () => {
    const ticks = touchRowsToTicks(parseTouchRowsText(edgesToTicks([0.03, 0.03])), YES, NO);
    const [ep] = traceEdgeEpisodes(ticks, { threshold: 0.01 });
    expect(ep.decayMs).toBeNull();
  });

  it('starts a new episode after the previous one decays', () => {
    const ticks = touchRowsToTicks(
      parseTouchRowsText(edgesToTicks([0.05, 0, 0, 0.04, 0.04, 0])),
      YES,
      NO
    );
    const eps = traceEdgeEpisodes(ticks, { threshold: 0.01 });
    expect(eps).toHaveLength(2);
    expect(eps[0].decayMs).toBe(50);
    expect(eps[1].decayMs).toBe(100);
  });

  it('returns no episodes for empty input', () => {
    expect(traceEdgeEpisodes([])).toEqual([]);
  });
});

describe('summarizeDecay', () => {
  it('reports survival fractions and median decay', () => {
    const ticks = touchRowsToTicks(
      parseTouchRowsText(edgesToTicks([0.05, 0.05, 0.05, 0, 0.04, 0])),
      YES,
      NO
    );
    const eps = traceEdgeEpisodes(ticks, { threshold: 0.01, horizonsMs: [50, 500] });
    const s = summarizeDecay(ticks, eps, { threshold: 0.01, horizonsMs: [50, 500] });
    expect(s.ticks).toBe(6);
    expect(s.episodes).toBe(2);
    expect(s.decayed).toBe(2);
    // ts: 0,50,100 @0.05 → dead at 150 (decay 150ms); 200 @0.04 → dead at 250 (50ms)
    expect(s.medianDecayMs).toBe(100);
    expect(s.horizons[0].survivalFrac).toBe(0.5); // ep1 alive +50ms, ep2 dead
    expect(s.horizons[1].survivalFrac).toBe(0); // both dead by +500ms
  });
});

describe('DEFAULT_DECAY_HORIZONS_MS', () => {
  it('covers sub-second to multi-second polling delays', () => {
    expect(DEFAULT_DECAY_HORIZONS_MS).toEqual([100, 250, 500, 1000, 2000, 5000]);
  });
});

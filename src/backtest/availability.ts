/**
 * Arb availability scan — how often did the edge exist and how fast did it decay?
 *
 * Detection parity with the live path: edge = 1 - (effectiveBuyYes +
 * effectiveBuyNo), same `getEffectivePrices` the strategy and engine use.
 * A window is a run of consecutive edge snapshots; its duration bounds how
 * long the bot would have had to capture that arb.
 */

import { getEffectivePrices } from '../utils/price-utils.js';
import type { BacktestSnapshot } from './types.js';

export interface ArbWindow {
  startTs: number;
  endTs: number;
  /** endTs - startTs in ms (0 for single-snapshot windows). */
  durationMs: number;
  snapshots: number;
  maxEdge: number;
}

export interface ArbAvailability {
  snapshots: number;
  edgeSnapshots: number;
  /** Fraction of snapshots showing an edge above threshold. */
  edgeFraction: number;
  windows: ArbWindow[];
  medianWindowMs: number;
  maxWindowMs: number;
  avgEdge: number;
  maxEdge: number;
}

export function snapshotEdge(snap: BacktestSnapshot): number {
  const e = getEffectivePrices(snap.yesAsk, snap.yesBid, snap.noAsk, snap.noBid);
  return 1 - (e.effectiveBuyYes + e.effectiveBuyNo);
}

export function scanArbAvailability(
  snapshots: BacktestSnapshot[],
  opts: { profitThreshold?: number } = {}
): ArbAvailability {
  const threshold = opts.profitThreshold ?? 0;
  const windows: ArbWindow[] = [];
  let edgeSnapshots = 0;
  let edgeSum = 0;
  let maxEdge = 0;

  let cur: ArbWindow | null = null;
  const close = () => {
    if (cur) {
      cur.durationMs = cur.endTs - cur.startTs;
      windows.push(cur);
      cur = null;
    }
  };

  for (const snap of snapshots) {
    const edge = snapshotEdge(snap);
    if (edge > threshold) {
      edgeSnapshots++;
      edgeSum += edge;
      if (edge > maxEdge) maxEdge = edge;
      if (cur) {
        cur.endTs = snap.ts;
        cur.snapshots++;
        if (edge > cur.maxEdge) cur.maxEdge = edge;
      } else {
        cur = { startTs: snap.ts, endTs: snap.ts, durationMs: 0, snapshots: 1, maxEdge: edge };
      }
    } else {
      close();
    }
  }
  close();

  const durations = windows.map((w) => w.durationMs).sort((a, b) => a - b);
  const medianWindowMs =
    durations.length === 0
      ? 0
      : durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;

  return {
    snapshots: snapshots.length,
    edgeSnapshots,
    edgeFraction: snapshots.length > 0 ? edgeSnapshots / snapshots.length : 0,
    windows,
    medianWindowMs,
    maxWindowMs: durations.length > 0 ? durations[durations.length - 1] : 0,
    avgEdge: edgeSnapshots > 0 ? edgeSum / edgeSnapshots : 0,
    maxEdge,
  };
}

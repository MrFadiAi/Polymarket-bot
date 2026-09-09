import { describe, it, expect } from 'vitest';
import { CopyPnlTracker } from './copy-pnl-tracker.js';

describe('CopyPnlTracker', () => {
  it('realizes profit on a round trip', () => {
    const t = new CopyPnlTracker();
    expect(t.recordFill('0xabc', 'BUY', 10, 0.4, 0)).toEqual({ closedSize: 0, realizedUsd: 0 });
    const close = t.recordFill('0xabc', 'SELL', 10, 0.6, 0);
    expect(close.closedSize).toBe(10);
    expect(close.realizedUsd).toBeCloseTo(2, 10);
    expect(t.totalRealizedUsd).toBeCloseTo(2, 10);
  });

  it('deducts fees from realized PnL', () => {
    const t = new CopyPnlTracker();
    t.recordFill('0xabc', 'BUY', 10, 0.4, 0.1);
    const close = t.recordFill('0xabc', 'SELL', 10, 0.6, 0.1);
    expect(close.realizedUsd).toBeCloseTo(1.8, 10);
  });

  it('handles partial closes FIFO', () => {
    const t = new CopyPnlTracker();
    t.recordFill('0xabc', 'BUY', 10, 0.4, 0);
    t.recordFill('0xabc', 'BUY', 10, 0.6, 0);
    const close = t.recordFill('0xabc', 'SELL', 10, 0.7, 0);
    // Closes the 0.4 lot first: 10 * (0.7 - 0.4) = 3
    expect(close.realizedUsd).toBeCloseTo(3, 10);
    expect(t.openLots('0xabc')).toHaveLength(1);
  });

  it('opens a short lot on a sell with no inventory', () => {
    const t = new CopyPnlTracker();
    t.recordFill('0xabc', 'SELL', 10, 0.6, 0);
    const close = t.recordFill('0xabc', 'BUY', 10, 0.4, 0);
    expect(close.realizedUsd).toBeCloseTo(2, 10);
  });

  it('isolates tokens and ignores degenerate fills', () => {
    const t = new CopyPnlTracker();
    t.recordFill('0xaaa', 'BUY', 10, 0.4, 0);
    expect(t.recordFill('0xbbb', 'SELL', 10, 0.6, 0).closedSize).toBe(0);
    expect(t.recordFill('0xaaa', 'BUY', 0, 0.5, 0)).toEqual({ closedSize: 0, realizedUsd: 0 });
    expect(t.totalRealizedUsd).toBe(0);
  });
});

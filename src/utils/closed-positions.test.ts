import { describe, it, expect } from 'vitest';
import { fetchClosedPnls } from './closed-positions.js';
import { toWalletQualityGate, type ComputedWalletQuality } from './risk.js';
import type { ClosedPosition } from '../clients/data-api.js';

function closed(pnl: number): ClosedPosition {
  return {
    proxyWallet: '0xabc',
    asset: '1',
    conditionId: '0xcond',
    avgPrice: 0.5,
    totalBought: 10,
    realizedPnl: pnl,
    curPrice: 1,
    timestamp: 1,
    title: 't',
    outcome: 'Yes',
    outcomeIndex: 0,
  };
}

describe('fetchClosedPnls', () => {
  it('paginates newest-first and maps realizedPnl', async () => {
    const page1 = [closed(1), closed(-2)];
    const calls: number[] = [];
    const stub = {
      getClosedPositions: async (_a: string, p?: { offset?: number }) => {
        calls.push(p?.offset ?? 0);
        return (p?.offset ?? 0) === 0 ? page1 : [];
      },
    };
    const out = await fetchClosedPnls(stub, '0xabc');
    expect(out).toEqual([{ cashPnl: 1 }, { cashPnl: -2 }]);
    expect(calls).toEqual([0]); // short page → done, no second request
  });

  it('stops at max', async () => {
    const stub = {
      getClosedPositions: async () => Array.from({ length: 50 }, () => closed(1)),
    };
    const out = await fetchClosedPnls(stub, '0xabc', 75);
    expect(out).toHaveLength(75);
  });
});

describe('toWalletQualityGate', () => {
  it('maps all six gate fields', () => {
    const q: ComputedWalletQuality = {
      tradeCount: 40,
      totalPnl: 600,
      winRate: 0.7,
      profitFactor: 2,
      consistencyScore: 0.8,
      singleTradeExposure: 0.1,
    };
    expect(toWalletQualityGate(q, 600, 40)).toEqual({
      winRate: 0.7,
      pnl: 600,
      tradeCount: 40,
      profitFactor: 2,
      consistencyScore: 0.8,
      singleTradeExposure: 0.1,
    });
  });
});

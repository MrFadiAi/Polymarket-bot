import { describe, it, expect } from 'vitest';
import { ArbitrageService } from './arbitrage-service.js';
import type { ArbitrageOpportunity } from './arbitrage-service.js';

const opp: ArbitrageOpportunity = {
  type: 'long',
  profitRate: 0.01,
  profitPercent: 1,
  effectivePrices: { buyYes: 0.4, buyNo: 0.5, sellYes: 0.4, sellNo: 0.5 },
  maxOrderbookSize: 100,
  maxBalanceSize: 100,
  recommendedSize: 50,
  estimatedProfit: 1,
  description: 'test',
  timestamp: Date.now(),
};

describe('ArbitrageService preExecutionGuard (audit #4)', () => {
  it('blocks execution when the guard returns a reason (no orders placed)', async () => {
    const svc = new ArbitrageService({ preExecutionGuard: () => 'risk-halted' });
    const result = await svc.execute(opp);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/risk-halted/);
    expect(result.size).toBe(0);
  });

  it('passes through to normal flow when the guard allows', async () => {
    const svc = new ArbitrageService({ preExecutionGuard: () => null });
    const result = await svc.execute(opp);
    // No private key in test → trading-unconfigured error, NOT a guard block.
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Trading not configured/);
  });

  it('exposes the received intent to the guard', async () => {
    const seen: unknown[] = [];
    const svc = new ArbitrageService({
      preExecutionGuard: (intent) => {
        seen.push(intent);
        return 'halted';
      },
    });
    await svc.execute(opp);
    // usdcAmount is the USD NOTIONAL, not the raw pair count:
    // 50 pairs × (buyYes 0.4 + buyNo 0.5) = $45
    expect(seen).toEqual([
      { strategy: 'arbitrage', side: 'BUY', usdcAmount: 45, marketKey: 'unknown' },
    ]);
  });
});

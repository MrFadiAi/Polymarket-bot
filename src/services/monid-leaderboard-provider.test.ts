import { describe, it, expect, vi } from 'vitest';
import { MonidLeaderboardProvider, type FetchLike } from './monid-leaderboard-provider.js';

function mockFetch(body: unknown, status = 200): FetchLike {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

const SAMPLE = {
  status: 'COMPLETED',
  output: {
    entries: [
      {
        rank: 1,
        user: '0xAAA',
        metrics: { total_pnl: 5_000_000, volume: 1_000_000, roi: 1.2, trades: 100, win_rate: 0.7, profit_factor: 3.1 },
        trading_styles: { is_whale: true },
      },
      {
        rank: 2,
        user: '0xBBB',
        metrics: { total_pnl: 2_000, volume: 50_000, roi: 0.1, trades: 40, win_rate: 0.45, profit_factor: 1.1 },
        trading_styles: { is_degen: true },
      },
    ],
  },
};

describe('MonidLeaderboardProvider', () => {
  it('requires an api key', () => {
    expect(() => new MonidLeaderboardProvider({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('maps Monid entries to normalized rows', async () => {
    const p = new MonidLeaderboardProvider({ apiKey: 'monid_live_test', fetchImpl: mockFetch(SAMPLE) });
    const rows = await p.fetchLeaderboard({ limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      address: '0xaaa',
      rank: 1,
      pnl: 5_000_000,
      winRate: 0.7,
      profitFactor: 3.1,
    });
    expect(rows[0].tradingStyles?.isWhale).toBe(true);
  });

  it('enforces minWinRate / minProfitFactor when metrics are present', async () => {
    const p = new MonidLeaderboardProvider({ apiKey: 'monid_live_test', fetchImpl: mockFetch(SAMPLE) });
    const rows = await p.fetchLeaderboard({ minWinRate: 0.6, minProfitFactor: 1.5 });
    expect(rows.map((r) => r.address)).toEqual(['0xaaa']); // 0xbbb filtered out
  });

  it('throws a clear error on 402 insufficient balance', async () => {
    const p = new MonidLeaderboardProvider({ apiKey: 'monid_live_test', fetchImpl: mockFetch({}, 402) });
    await expect(p.fetchLeaderboard({})).rejects.toThrow(/balance/);
  });
});

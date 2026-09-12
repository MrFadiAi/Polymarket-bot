/**
 * MonidLeaderboardProvider — optional enriched smart-money source via the Monid REST API.
 *
 * Docs: https://docs.monid.ai  ·  Base URL: https://api.monid.ai
 *   POST /v1/run  { provider, endpoint, input }   (Authorization: Bearer monid_live_...)
 *   -> 200 sync, or 202 + runId then GET /v1/runs/:runId
 *
 * It calls the BlockRun Polymarket leaderboard endpoint, which returns up to 100 wallets
 * each already carrying win_rate / profit_factor / roi / trader style flags — so
 * minWinRate / minProfitFactor can be enforced without a per-wallet position crawl.
 *
 * Verified entry shape (output.entries[]):
 *   { rank, user, metrics:{ realized_pnl, total_pnl, volume, roi, trades, win_rate,
 *       profit_factor, positions_closed }, trading_styles:{ is_whale, is_degen,
 *       is_high_conviction, is_market_maker, is_contrarian }, entry_edge, first_trade_at }
 *
 * NOTE: the field mapping below is validated against the documented schema. If a live key
 * shows this endpoint expects `input.queryParams` instead of flat `input`, flip INPUT_STYLE.
 */
import type { TimePeriod } from './wallet-service.js';
import {
  type LeaderboardProvider,
  type LeaderboardQuery,
  type SmartMoneyLeaderboardRow,
  applyMetricFilters,
} from './leaderboard-provider.js';

/** Minimal fetch signature so this compiles without DOM lib and is trivially mockable in tests. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface MonidProviderOptions {
  /** monid_live_... key from app.monid.ai */
  apiKey: string;
  /** default https://api.monid.ai */
  baseUrl?: string;
  /** in-memory cache TTL (ms). */
  cacheTtlMs?: number;
  /** max ms to wait when an endpoint runs async (202 + runId). */
  asyncTimeoutMs?: number;
  /** override for tests. */
  fetchImpl?: FetchLike;
}

const PROVIDER = 'blockrun.ai';
const ENDPOINT = '/api/v1/pm/polymarket/leaderboard';
// flip to 'nested' if a live test shows the endpoint wants input.queryParams
const INPUT_STYLE: 'flat' | 'nested' = 'flat';

const PERIOD_TO_WINDOW: Record<TimePeriod, string> = {
  all: 'all_time',
  day: '1d',
  week: '7d',
  month: '30d',
};

interface MonidEntry {
  rank: number;
  user: string;
  metrics?: {
    realized_pnl?: number;
    total_pnl?: number;
    volume?: number;
    roi?: number;
    trades?: number;
    win_rate?: number;
    profit_factor?: number;
    positions_closed?: number;
  };
  trading_styles?: {
    is_whale?: boolean;
    is_degen?: boolean;
    is_high_conviction?: boolean;
    is_market_maker?: boolean;
    is_contrarian?: boolean;
  };
  entry_edge?: number;
  first_trade_at?: string;
}

interface MonidRunResponse {
  runId?: string;
  status?: 'RUNNING' | 'COMPLETED' | 'FAILED';
  output?: { entries?: MonidEntry[] };
  providerResponse?: { httpStatus?: number };
}

export class MonidLeaderboardProvider implements LeaderboardProvider {
  readonly name = 'monid';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;
  private readonly asyncTimeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private cache?: { at: number; key: string; data: SmartMoneyLeaderboardRow[] };

  constructor(opts: MonidProviderOptions) {
    if (!opts.apiKey) throw new Error('MonidLeaderboardProvider: apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.monid.ai').replace(/\/$/, '');
    this.cacheTtlMs = opts.cacheTtlMs ?? 60_000;
    this.asyncTimeoutMs = opts.asyncTimeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  async fetchLeaderboard(query: LeaderboardQuery): Promise<SmartMoneyLeaderboardRow[]> {
    const window = PERIOD_TO_WINDOW[query.period ?? 'all'] ?? 'all_time';
    const limit = query.limit ?? 100;
    const cacheKey = `${window}:${limit}`;

    const now = Date.now();
    if (this.cache && this.cache.key === cacheKey && now - this.cache.at < this.cacheTtlMs) {
      return applyMetricFilters(this.cache.data, query);
    }

    const params = { window, sort_by: 'total_pnl', order: 'desc', limit };
    const input = INPUT_STYLE === 'flat' ? params : { queryParams: params };

    const run = await this.runEndpoint({ provider: PROVIDER, endpoint: ENDPOINT, input });
    const entries = run.output?.entries ?? [];

    const rows: SmartMoneyLeaderboardRow[] = entries.map((e) => {
      const m = e.metrics ?? {};
      const s = e.trading_styles ?? {};
      return {
        address: (e.user ?? '').toLowerCase(),
        rank: e.rank,
        pnl: Number(m.total_pnl ?? 0),
        volume: m.volume,
        tradeCount: m.trades,
        roi: m.roi,
        winRate: m.win_rate,
        profitFactor: m.profit_factor,
        tradingStyles: {
          isWhale: s.is_whale,
          isDegen: s.is_degen,
          isHighConviction: s.is_high_conviction,
          isMarketMaker: s.is_market_maker,
          isContrarian: s.is_contrarian,
        },
      };
    });

    this.cache = { at: now, key: cacheKey, data: rows };
    return applyMetricFilters(rows, query).sort((a, b) => b.pnl - a.pnl);
  }

  /** POST /v1/run, transparently handling async (202 + runId -> poll GET /v1/runs/:id). */
  private async runEndpoint(payload: {
    provider: string;
    endpoint: string;
    input: Record<string, unknown>;
  }): Promise<MonidRunResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 402) throw new Error('Monid: insufficient balance (402)');
    if (!res.ok && res.status !== 202) {
      throw new Error(`Monid /v1/run ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const data = (await res.json()) as MonidRunResponse;
    if (data.status === 'COMPLETED') return data;
    if (data.status === 'FAILED') throw new Error('Monid run FAILED');
    if (res.status === 202 && data.runId) return this.pollRun(data.runId);
    return data; // 200 without explicit status — assume the body already carries output
  }

  private async pollRun(runId: string): Promise<MonidRunResponse> {
    const deadline = Date.now() + this.asyncTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await this.fetchImpl(`${this.baseUrl}/v1/runs/${runId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) throw new Error(`Monid /v1/runs/${runId} ${res.status}`);
      const data = (await res.json()) as MonidRunResponse;
      if (data.status === 'COMPLETED') return data;
      if (data.status === 'FAILED') throw new Error('Monid run FAILED');
    }
    throw new Error(`Monid run ${runId} timed out`);
  }
}

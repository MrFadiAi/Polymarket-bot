/**
 * Polymarket Subgraph Client
 *
 * 官方文档: https://docs.polymarket.com/developers/subgraph/overview
 * Schema 仓库: https://github.com/Polymarket/polymarket-subgraph
 *
 * 5 个 Subgraph:
 * - Positions (0.0.7): 用户余额、Net 余额
 * - PnL (0.0.14): 用户持仓、PnL、Condition 结算状态
 * - Activity (0.0.4): Split/Merge/Redemption 事件
 * - OI (0.0.6): 市场/全局 Open Interest
 * - Orderbook (0.0.1): 订单成交事件
 */

import { RateLimiter, ApiType } from '../core/rate-limiter.js';
import type { UnifiedCache } from '../core/unified-cache.js';

// ==================== 端点配置 ====================

export const SUBGRAPH_ENDPOINTS = {
  positions: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
  activity: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn',
  oi: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/oi-subgraph/0.0.6/gn',
  orderbook: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn',
} as const;

export type SubgraphName = keyof typeof SUBGRAPH_ENDPOINTS;

// ==================== 类型定义 ====================

// Positions Subgraph
export interface UserBalance {
  id: string;
  user: string;
  asset: string;
  balance: string; // BigInt as string
}

export interface NetUserBalance {
  id: string;
  user: string;
  asset: string;
  balance: string;
}

// PnL Subgraph
export interface UserPosition {
  id: string;
  user: string;
  tokenId: string; // BigInt as string
  amount: string;
  avgPrice: string;
  realizedPnl: string;
  totalBought: string;
}

export interface Condition {
  id: string;
  positionIds: string[];
  payoutNumerators: string[];
  payoutDenominator: string;
}

// Activity Subgraph
export interface Split {
  id: string;
  timestamp: string;
  stakeholder: string;
  condition: string;
  amount: string;
}

export interface Merge {
  id: string;
  timestamp: string;
  stakeholder: string;
  condition: string;
  amount: string;
}

export interface Redemption {
  id: string;
  timestamp: string;
  redeemer: string;
  condition: string;
  payout: string;
}

// OI Subgraph
export interface MarketOpenInterest {
  id: string; // condition id
  amount: string;
}

export interface GlobalOpenInterest {
  id: string;
  amount: string;
}

// Orderbook Subgraph
export interface OrderFilledEvent {
  id: string;
  transactionHash: string;
  timestamp: string;
  orderHash: string;
  maker: string;
  taker: string;
  makerAssetId: string;
  takerAssetId: string;
  makerAmountFilled: string;
  takerAmountFilled: string;
  fee: string;
}

export interface MarketData {
  id: string;
  volume: string;
}

// ==================== 查询参数 ====================

export interface SubgraphQueryParams {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  where?: Record<string, unknown>;
}

// ==================== 响应类型 ====================

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown[] }>;
}

// ==================== 客户端实现 ====================

export class SubgraphClient {
  constructor(
    private rateLimiter: RateLimiter,
    private cache: UnifiedCache
  ) {}

  /**
   * 执行 GraphQL 查询
   */
  private async query<T>(subgraph: SubgraphName, queryStr: string): Promise<T> {
    const endpoint = SUBGRAPH_ENDPOINTS[subgraph];
    const cacheKey = `subgraph:${subgraph}:${queryStr}`;

    // 检查缓存
    const cached = await this.cache.get<T>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // 限流并执行请求
    const data = await this.rateLimiter.execute(ApiType.SUBGRAPH, async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryStr }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Subgraph request failed: HTTP ${response.status} - ${text.slice(0, 200)}`);
      }

      const result = (await response.json()) as GraphQLResponse<T>;

      if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      if (!result.data) {
        throw new Error(`No data returned from subgraph. Response: ${JSON.stringify(result).slice(0, 200)}`);
      }

      return result.data;
    });

    // 缓存结果 (短 TTL，subgraph 数据更新较快)
    await this.cache.set(cacheKey, data, 30_000);

    return data;
  }

  /**
   * 构建查询字符串
   */
  private buildQuery(
    entityName: string,
    fields: string[],
    params: SubgraphQueryParams = {}
  ): string {
    const args: string[] = [];

    if (params.first !== undefined) {
      args.push(`first: ${params.first}`);
    }
    if (params.skip !== undefined) {
      args.push(`skip: ${params.skip}`);
    }
    if (params.orderBy) {
      args.push(`orderBy: ${params.orderBy}`);
    }
    if (params.orderDirection) {
      args.push(`orderDirection: ${params.orderDirection}`);
    }
    if (params.where && Object.keys(params.where).length > 0) {
      // Build where clause manually to avoid JSON quote issues
      const whereParts = Object.entries(params.where).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      });
      args.push(`where: { ${whereParts.join(', ')} }`);
    }

    const argsStr = args.length > 0 ? `(${args.join(', ')})` : '';
    const fieldsStr = fields.join('\n      ');

    return `{
      ${entityName}${argsStr} {
        ${fieldsStr}
      }
    }`;
  }

  // ==================== Positions Subgraph ====================

  /**
   * 获取用户余额
   */
  async getUserBalances(user: string, params: SubgraphQueryParams = {}): Promise<UserBalance[]> {
    const query = this.buildQuery(
      'userBalances',
      ['id', 'user', 'asset', 'balance'],
      {
        ...params,
        where: { ...params.where, user: user.toLowerCase() },
      }
    );
    const result = await this.query<{ userBalances: UserBalance[] }>('positions', query);
    return result.userBalances;
  }

  /**
   * 获取 Net 用户余额
   */
  async getNetUserBalances(user: string, params: SubgraphQueryParams = {}): Promise<NetUserBalance[]> {
    const query = this.buildQuery(
      'netUserBalances',
      ['id', 'user', 'asset', 'balance'],
      {
        ...params,
        where: { ...params.where, user: user.toLowerCase() },
      }
    );
    const result = await this.query<{ netUserBalances: NetUserBalance[] }>('positions', query);
    return result.netUserBalances;
  }

  // ==================== PnL Subgraph ====================

  /**
   * 获取用户持仓 (含 PnL)
   */
  async getUserPositions(user: string, params: SubgraphQueryParams = {}): Promise<UserPosition[]> {
    const query = this.buildQuery(
      'userPositions',
      ['id', 'user', 'tokenId', 'amount', 'avgPrice', 'realizedPnl', 'totalBought'],
      {
        orderBy: 'realizedPnl',
        orderDirection: 'desc',
        ...params,
        where: { ...params.where, user: user.toLowerCase() },
      }
    );
    const result = await this.query<{ userPositions: UserPosition[] }>('pnl', query);
    return result.userPositions;
  }

  /**
   * 获取 Condition 结算状态
   */
  async getConditions(params: SubgraphQueryParams = {}): Promise<Condition[]> {
    const query = this.buildQuery(
      'conditions',
      ['id', 'positionIds', 'payoutNumerators', 'payoutDenominator'],
      params
    );
    const result = await this.query<{ conditions: Condition[] }>('pnl', query);
    return result.conditions;
  }

  /**
   * 获取单个 Condition
   */
  async getCondition(conditionId: string): Promise<Condition | null> {
    const query = `{
      condition(id: "${conditionId.toLowerCase()}") {
        id
        positionIds
        payoutNumerators
        payoutDenominator
      }
    }`;
    const result = await this.query<{ condition: Condition | null }>('pnl', query);
    return result.condition;
  }

  /**
   * 检查 Condition 是否已结算
   */
  async isConditionResolved(conditionId: string): Promise<boolean> {
    const condition = await this.getCondition(conditionId);
    if (!condition) return false;
    return condition.payoutNumerators.length > 0 && condition.payoutDenominator !== '0';
  }

  // ==================== Activity Subgraph ====================

  /**
   * 获取用户的 Split 事件
   */
  async getSplits(user: string, params: SubgraphQueryParams = {}): Promise<Split[]> {
    const query = this.buildQuery(
      'splits',
      ['id', 'timestamp', 'stakeholder', 'condition', 'amount'],
      {
        orderBy: 'timestamp',
        orderDirection: 'desc',
        ...params,
        where: { ...params.where, stakeholder: user.toLowerCase() },
      }
    );
    const result = await this.query<{ splits: Split[] }>('activity', query);
    return result.splits;
  }

  /**
   * 获取用户的 Merge 事件
   */
  async getMerges(user: string, params: SubgraphQueryParams = {}): Promise<Merge[]> {
    const query = this.buildQuery(
      'merges',
      ['id', 'timestamp', 'stakeholder', 'condition', 'amount'],
      {
        orderBy: 'timestamp',
        orderDirection: 'desc',
        ...params,
        where: { ...params.where, stakeholder: user.toLowerCase() },
      }
    );
    const result = await this.query<{ merges: Merge[] }>('activity', query);
    return result.merges;
  }

  /**
   * 获取用户的 Redemption 事件
   */
  async getRedemptions(user: string, params: SubgraphQueryParams = {}): Promise<Redemption[]> {
    const query = this.buildQuery(
      'redemptions',
      ['id', 'timestamp', 'redeemer', 'condition', 'payout'],
      {
        orderBy: 'timestamp',
        orderDirection: 'desc',
        ...params,
        where: { ...params.where, redeemer: user.toLowerCase() },
      }
    );
    const result = await this.query<{ redemptions: Redemption[] }>('activity', query);
    return result.redemptions;
  }

  /**
   * 获取最近的 Redemption 事件 (不限用户)
   */
  async getRecentRedemptions(params: SubgraphQueryParams = {}): Promise<Redemption[]> {
    const query = this.buildQuery(
      'redemptions',
      ['id', 'timestamp', 'redeemer', 'condition', 'payout'],
      {
        orderBy: 'timestamp',
        orderDirection: 'desc',
        first: 100,
        ...params,
      }
    );
    const result = await this.query<{ redemptions: Redemption[] }>('activity', query);
    return result.redemptions;
  }

  // ==================== OI Subgraph ====================

  /**
   * 获取市场 Open Interest
   */
  async getMarketOpenInterest(conditionId: string): Promise<MarketOpenInterest | null> {
    const query = `{
      marketOpenInterest(id: "${conditionId.toLowerCase()}") {
        id
        amount
      }
    }`;
    const result = await this.query<{ marketOpenInterest: MarketOpenInterest | null }>('oi', query);
    return result.marketOpenInterest;
  }

  /**
   * 获取 Top 市场按 OI 排序
   */
  async getTopMarketsByOI(params: SubgraphQueryParams = {}): Promise<MarketOpenInterest[]> {
    const query = this.buildQuery(
      'marketOpenInterests',
      ['id', 'amount'],
      {
        orderBy: 'amount',
        orderDirection: 'desc',
        first: 50,
        ...params,
      }
    );
    const result = await this.query<{ marketOpenInterests: MarketOpenInterest[] }>('oi', query);
    return result.marketOpenInterests;
  }

  /**
   * 获取全局 Open Interest
   */
  async getGlobalOpenInterest(): Promise<string> {
    const query = `{
      globalOpenInterests(first: 1) {
        id
        amount
      }
    }`;
    const result = await this.query<{ globalOpenInterests: GlobalOpenInterest[] }>('oi', query);
    return result.globalOpenInterests[0]?.amount || '0';
  }

  // ==================== Orderbook Subgraph ====================

  /**
   * 获取订单成交事件
   */
  async getOrderFilledEvents(params: SubgraphQueryParams = {}): Promise<OrderFilledEvent[]> {
    const query = this.buildQuery(
      'orderFilledEvents',
      ['id', 'transactionHash', 'timestamp', 'orderHash', 'maker', 'taker', 'makerAssetId', 'takerAssetId', 'makerAmountFilled', 'takerAmountFilled', 'fee'],
      {
        orderBy: 'timestamp',
        orderDirection: 'desc',
        first: 100,
        ...params,
      }
    );
    const result = await this.query<{ orderFilledEvents: OrderFilledEvent[] }>('orderbook', query);
    return result.orderFilledEvents;
  }

  /**
   * 获取用户作为 maker 的成交事件
   */
  async getMakerFills(maker: string, params: SubgraphQueryParams = {}): Promise<OrderFilledEvent[]> {
    const query = this.buildQuery(
      'orderFilledEvents',
      ['id', 'transactionHash', 'timestamp', 'orderHash', 'maker', 'taker', 'makerAssetId', 'takerAssetId', 'makerAmountFilled', 'takerAmountFilled', 'fee'],
      {
        orderBy: 'timestamp',
        orderDirection: 'desc',
        ...params,
        where: { ...params.where, maker: maker.toLowerCase() },
      }
    );
    const result = await this.query<{ orderFilledEvents: OrderFilledEvent[] }>('orderbook', query);
    return result.orderFilledEvents;
  }

  /**
   * 获取用户作为 taker 的成交事件
   */
  async getTakerFills(taker: string, params: SubgraphQueryParams = {}): Promise<OrderFilledEvent[]> {
    const query = this.buildQuery(
      'orderFilledEvents',
      ['id', 'transactionHash', 'timestamp', 'orderHash', 'maker', 'taker', 'makerAssetId', 'takerAssetId', 'makerAmountFilled', 'takerAmountFilled', 'fee'],
      {
        orderBy: 'timestamp',
        orderDirection: 'desc',
        ...params,
        where: { ...params.where, taker: taker.toLowerCase() },
      }
    );
    const result = await this.query<{ orderFilledEvents: OrderFilledEvent[] }>('orderbook', query);
    return result.orderFilledEvents;
  }

  /**
   * 获取市场数据
   */
  async getMarketData(assetId: string): Promise<MarketData | null> {
    const query = `{
      marketData(id: "${assetId}") {
        id
        volume
      }
    }`;
    const result = await this.query<{ marketData: MarketData | null }>('orderbook', query);
    return result.marketData;
  }

  // ==================== 便捷方法 ====================

  /**
   * 获取用户完整的链上活动摘要
   */
  async getUserActivitySummary(user: string): Promise<{
    positions: UserPosition[];
    splits: Split[];
    merges: Merge[];
    redemptions: Redemption[];
    makerFills: OrderFilledEvent[];
    takerFills: OrderFilledEvent[];
  }> {
    const [positions, splits, merges, redemptions, makerFills, takerFills] = await Promise.all([
      this.getUserPositions(user, { first: 100 }),
      this.getSplits(user, { first: 50 }),
      this.getMerges(user, { first: 50 }),
      this.getRedemptions(user, { first: 50 }),
      this.getMakerFills(user, { first: 50 }),
      this.getTakerFills(user, { first: 50 }),
    ]);

    return { positions, splits, merges, redemptions, makerFills, takerFills };
  }
}

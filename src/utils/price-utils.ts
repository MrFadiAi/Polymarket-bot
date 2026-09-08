/**
 * Price Utilities for Polymarket Trading
 *
 * Provides helpers for:
 * - Price validation and rounding to tick size
 * - Size validation
 * - Order amount calculation
 */

// Tick size types (as defined by Polymarket)
export type TickSize = '0.1' | '0.01' | '0.001' | '0.0001';

// Rounding configuration for each tick size
export const ROUNDING_CONFIG: Record<
  TickSize,
  { price: number; size: number; amount: number }
> = {
  '0.1': { price: 1, size: 2, amount: 2 },
  '0.01': { price: 2, size: 2, amount: 4 },
  '0.001': { price: 3, size: 2, amount: 5 },
  '0.0001': { price: 4, size: 2, amount: 6 },
};

/**
 * Round a price to the appropriate tick size
 *
 * @param price - The price to round (0 to 1)
 * @param tickSize - The tick size for the market
 * @param direction - 'floor' for sells, 'ceil' for buys, 'round' for midpoint
 * @returns Rounded price
 *
 * @example
 * roundPrice(0.523, '0.01', 'floor') // 0.52
 * roundPrice(0.523, '0.01', 'ceil') // 0.53
 */
export function roundPrice(
  price: number,
  tickSize: TickSize,
  direction: 'floor' | 'ceil' | 'round' = 'round'
): number {
  const decimals = ROUNDING_CONFIG[tickSize].price;
  const multiplier = Math.pow(10, decimals);

  let rounded: number;
  switch (direction) {
    case 'floor':
      rounded = Math.floor(price * multiplier) / multiplier;
      break;
    case 'ceil':
      rounded = Math.ceil(price * multiplier) / multiplier;
      break;
    default:
      rounded = Math.round(price * multiplier) / multiplier;
  }

  // Clamp to valid price range
  return Math.max(0.001, Math.min(0.999, rounded));
}

/**
 * Round a size to valid decimals (always 2 decimal places)
 */
export function roundSize(size: number): number {
  return Math.round(size * 100) / 100;
}

/**
 * Validate a price is within valid range and tick size
 *
 * @param price - The price to validate
 * @param tickSize - The tick size for the market
 * @returns Validation result with error message if invalid
 */
export function validatePrice(
  price: number,
  tickSize: TickSize
): { valid: boolean; error?: string } {
  // Check range
  if (price < 0.001 || price > 0.999) {
    return { valid: false, error: 'Price must be between 0.001 and 0.999' };
  }

  // Check tick size alignment
  const decimals = ROUNDING_CONFIG[tickSize].price;
  const multiplier = Math.pow(10, decimals);
  const rounded = Math.round(price * multiplier) / multiplier;

  if (Math.abs(price - rounded) > 1e-10) {
    return {
      valid: false,
      error: `Price ${price} does not align with tick size ${tickSize}. Use ${rounded} instead.`,
    };
  }

  return { valid: true };
}

/**
 * Validate minimum size requirements
 *
 * @param size - The size to validate
 * @param minOrderSize - Minimum order size from market config (usually 0.1)
 */
export function validateSize(
  size: number,
  minOrderSize = 0.1
): { valid: boolean; error?: string } {
  if (size < minOrderSize) {
    return {
      valid: false,
      error: `Size ${size} is below minimum order size ${minOrderSize}`,
    };
  }

  return { valid: true };
}

/**
 * Calculate the amount needed for a buy order (in USDC)
 *
 * @param price - Price per share
 * @param size - Number of shares to buy
 * @returns Amount in USDC
 */
export function calculateBuyAmount(price: number, size: number): number {
  return price * size;
}

/**
 * Calculate the payout for a sell order (in USDC)
 *
 * @param price - Price per share
 * @param size - Number of shares to sell
 * @returns Amount in USDC
 */
export function calculateSellPayout(price: number, size: number): number {
  return price * size;
}

/**
 * Calculate number of shares that can be bought with a given amount
 *
 * @param amount - USDC amount to spend
 * @param price - Price per share
 * @returns Number of shares
 */
export function calculateSharesForAmount(
  amount: number,
  price: number
): number {
  return roundSize(amount / price);
}

/**
 * Calculate the spread between bid and ask
 *
 * @param bid - Highest bid price
 * @param ask - Lowest ask price
 * @returns Spread as a decimal (0 to 1)
 */
export function calculateSpread(bid: number, ask: number): number {
  return ask - bid;
}

/**
 * Calculate the midpoint price between bid and ask
 *
 * @param bid - Highest bid price
 * @param ask - Lowest ask price
 * @returns Midpoint price
 */
export function calculateMidpoint(bid: number, ask: number): number {
  return (bid + ask) / 2;
}

/**
 * 计算有效价格（考虑 Polymarket 订单簿的镜像特性）
 *
 * Polymarket 的关键特性：买 YES @ P = 卖 NO @ (1-P)
 * 因此同一订单会在两个订单簿中出现
 *
 * 有效价格是考虑镜像后的最优价格
 *
 * @param yesAsk - YES token 的最低卖价
 * @param yesBid - YES token 的最高买价
 * @param noAsk - NO token 的最低卖价
 * @param noBid - NO token 的最高买价
 */
export function getEffectivePrices(
  yesAsk: number,
  yesBid: number,
  noAsk: number,
  noBid: number
): {
  effectiveBuyYes: number;
  effectiveBuyNo: number;
  effectiveSellYes: number;
  effectiveSellNo: number;
} {
  return {
    // 买 YES: 直接买 YES.ask 或 通过卖 NO (成本 = 1 - NO.bid)
    effectiveBuyYes: Math.min(yesAsk, 1 - noBid),

    // 买 NO: 直接买 NO.ask 或 通过卖 YES (成本 = 1 - YES.bid)
    effectiveBuyNo: Math.min(noAsk, 1 - yesBid),

    // 卖 YES: 直接卖 YES.bid 或 通过买 NO (收入 = 1 - NO.ask)
    effectiveSellYes: Math.max(yesBid, 1 - noAsk),

    // 卖 NO: 直接卖 NO.bid 或 通过买 YES (收入 = 1 - YES.ask)
    effectiveSellNo: Math.max(noBid, 1 - yesAsk),
  };
}

/**
 * Fee-aware arbitrage helpers (PROBLEMS.md #1)
 *
 * Polymarket fills report `fee_rate_bps` (see TradingService.getTrades()).
 * Gross price-implied edge must be reduced by taker fees and gas before it
 * can be treated as a real opportunity.
 */

/** Default taker fee when the venue reports none (basis points). */
export const DEFAULT_TAKER_FEE_RATE_BPS = 0;

/**
 * Estimate taker fee in USDC for a given notional.
 *
 * @param notionalUsd - Traded notional in USDC
 * @param feeRateBps - Fee rate in basis points (e.g. 10 = 0.1%)
 */
export function estimateTakerFee(notionalUsd: number, feeRateBps: number): number {
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return 0;
  if (!Number.isFinite(feeRateBps) || feeRateBps <= 0) return 0;
  return (notionalUsd * feeRateBps) / 10_000;
}

export interface NetArbProfit {
  /** Gross price-implied profit in USDC */
  gross: number;
  /** Estimated taker fees in USDC */
  fee: number;
  /** Gas cost in USDC */
  gas: number;
  /** Net profit in USDC (gross - fee - gas) */
  net: number;
  /** Net profit per unit size */
  netPerUnit: number;
}

/**
 * Net profit for a long arb (buy YES + NO, merge to $1).
 *
 * @param longCost - Effective cost per pair (buyYes + buyNo)
 * @param size - Number of pairs
 * @param feeRateBps - Taker fee in basis points applied to buy notional
 * @param gasCostUsd - Estimated gas per arb cycle in USDC
 */
export function calculateNetLongArbProfit(
  longCost: number,
  size: number,
  feeRateBps: number = DEFAULT_TAKER_FEE_RATE_BPS,
  gasCostUsd: number = 0
): NetArbProfit {
  const gross = (1 - longCost) * size;
  const fee = estimateTakerFee(longCost * size, feeRateBps);
  const gas = Number.isFinite(gasCostUsd) && gasCostUsd > 0 ? gasCostUsd : 0;
  const net = gross - fee - gas;
  return { gross, fee, gas, net, netPerUnit: size > 0 ? net / size : 0 };
}

/**
 * Net profit for a short arb (sell pre-held YES + NO).
 *
 * @param shortRevenue - Effective revenue per pair (sellYes + sellNo)
 * @param size - Number of pairs
 * @param feeRateBps - Taker fee in basis points applied to sell notional
 * @param gasCostUsd - Estimated gas per arb cycle in USDC
 */
export function calculateNetShortArbProfit(
  shortRevenue: number,
  size: number,
  feeRateBps: number = DEFAULT_TAKER_FEE_RATE_BPS,
  gasCostUsd: number = 0
): NetArbProfit {
  const gross = (shortRevenue - 1) * size;
  const fee = estimateTakerFee(shortRevenue * size, feeRateBps);
  const gas = Number.isFinite(gasCostUsd) && gasCostUsd > 0 ? gasCostUsd : 0;
  const net = gross - fee - gas;
  return { gross, fee, gas, net, netPerUnit: size > 0 ? net / size : 0 };
}

// Orderbook depth type shared by execution-size helpers.
export interface PriceLevel {
  price: number;
  size: number;
}

export interface ExecutableSize {
  /** Executable size in shares after safety factor */
  size: number;
  /** Volume-weighted average price of the executable depth */
  vwap: number;
  /** Whether requested cap price constrained the depth */
  priceConstrained: boolean;
}

/**
 * Aggregate top-of-book depth across multiple levels (PROBLEMS.md #2).
 *
 * Replaces level-0-only sizing: walks price levels in order, optionally
 * stopping at a cap price, and applies a safety factor.
 *
 * @param levels - Price levels sorted best-first (asks ascending, bids descending)
 * @param safetyFactor - Fraction of depth treated as executable (0-1)
 * @param capPrice - Optional bound: for asks the max acceptable price,
 *   for bids the min acceptable price
 * @param isAsk - true when levels are asks (cap = max price), false for bids (cap = min price)
 * @param maxLevels - Maximum number of levels to consume
 */
export function calculateExecutableSize(
  levels: PriceLevel[],
  safetyFactor: number = 0.8,
  capPrice?: number,
  isAsk: boolean = true,
  maxLevels: number = 5
): ExecutableSize {
  const safeFactor =
    Number.isFinite(safetyFactor) && safetyFactor > 0
      ? Math.min(1, safetyFactor)
      : 0.8;
  const depth = levels.slice(0, Math.max(1, Math.min(maxLevels, levels.length)));
  let totalSize = 0;
  let notional = 0;
  let priceConstrained = false;

  for (const level of depth) {
    if (!Number.isFinite(level.price) || !Number.isFinite(level.size) || level.size <= 0) {
      continue;
    }
    if (capPrice !== undefined && Number.isFinite(capPrice)) {
      if (isAsk && level.price > capPrice) {
        priceConstrained = true;
        break;
      }
      if (!isAsk && level.price < capPrice) {
        priceConstrained = true;
        break;
      }
    }
    totalSize += level.size;
    notional += level.price * level.size;
  }

  const size = totalSize * safeFactor;
  return { size, vwap: totalSize > 0 ? notional / totalSize : 0, priceConstrained };
}

/**
 * Check if there's an arbitrage opportunity
 *
 * 使用有效价格计算套利机会（正确考虑镜像订单）
 *
 * Long arb: Buy YES + Buy NO < 1 (使用有效买入价格)
 * Short arb: Sell YES + Sell NO > 1 (使用有效卖出价格)
 *
 * 详细文档见: docs/01-polymarket-orderbook-arbitrage.md
 *
 * @param yesAsk - Lowest ask for YES token
 * @param noAsk - Lowest ask for NO token
 * @param yesBid - Highest bid for YES token
 * @param noBid - Highest bid for NO token
 * @param opts - Optional fee/gas adjustment (PROBLEMS.md #1). When `size`
 *   is provided, gross edge must also survive fees + gas at that size.
 * @returns Arbitrage info or null
 */
export function checkArbitrage(
  yesAsk: number,
  noAsk: number,
  yesBid: number,
  noBid: number,
  opts: { feeRateBps?: number; gasCostUsd?: number; size?: number } = {}
): { type: 'long' | 'short'; profit: number; description: string } | null {
  // 计算有效价格
  const effective = getEffectivePrices(yesAsk, yesBid, noAsk, noBid);

  const feeRateBps = opts.feeRateBps ?? DEFAULT_TAKER_FEE_RATE_BPS;
  const gasCostUsd = opts.gasCostUsd ?? 0;
  const size = opts.size ?? 1;
  const feeAware = feeRateBps > 0 || gasCostUsd > 0;

  // Long arbitrage: Buy complete set (YES + NO) cheaper than $1
  const effectiveLongCost = effective.effectiveBuyYes + effective.effectiveBuyNo;
  const longProfit = 1 - effectiveLongCost;

  if (longProfit > 0) {
    // Fee/gas gate: a gross edge that does not survive costs is not an opp.
    if (feeAware) {
      const net = calculateNetLongArbProfit(effectiveLongCost, size, feeRateBps, gasCostUsd);
      if (net.net <= 0) return null;
    }
    return {
      type: 'long',
      profit: longProfit,
      description: `Buy YES @ ${effective.effectiveBuyYes.toFixed(4)} + NO @ ${effective.effectiveBuyNo.toFixed(4)}, Merge for $1`,
    };
  }

  // Short arbitrage: Sell complete set (YES + NO) for more than $1
  const effectiveShortRevenue = effective.effectiveSellYes + effective.effectiveSellNo;
  const shortProfit = effectiveShortRevenue - 1;

  if (shortProfit > 0) {
    if (feeAware) {
      const net = calculateNetShortArbProfit(effectiveShortRevenue, size, feeRateBps, gasCostUsd);
      if (net.net <= 0) return null;
    }
    return {
      type: 'short',
      profit: shortProfit,
      description: `Split $1, Sell YES @ ${effective.effectiveSellYes.toFixed(4)} + NO @ ${effective.effectiveSellNo.toFixed(4)}`,
    };
  }

  return null;
}

/**
 * Format price for display
 */
export function formatPrice(price: number, tickSize?: TickSize): string {
  const decimals = tickSize ? ROUNDING_CONFIG[tickSize].price : 4;
  return price.toFixed(decimals);
}

/**
 * Format amount in USDC
 */
export function formatUSDC(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Calculate PnL for a position
 *
 * @param entryPrice - Average entry price
 * @param currentPrice - Current market price
 * @param size - Position size
 * @param side - 'long' for YES, 'short' for NO
 */
export function calculatePnL(
  entryPrice: number,
  currentPrice: number,
  size: number,
  side: 'long' | 'short' = 'long'
): { pnl: number; pnlPercent: number } {
  const pnl =
    side === 'long'
      ? (currentPrice - entryPrice) * size
      : (entryPrice - currentPrice) * size;

  const pnlPercent =
    side === 'long'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

  return { pnl, pnlPercent };
}

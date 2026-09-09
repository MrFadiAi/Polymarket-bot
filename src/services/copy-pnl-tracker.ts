/**
 * Live copy-trade PnL tracker (audit #2 fix).
 *
 * The copy engine mirrors whale prints but previously recorded $0 profit per
 * copy (`recordTrade(0, 'smartMoney')`), making Smart Money performance a
 * blind box. This tracker FIFO-matches our own copy fills per token into
 * closed lots and reports realized PnL as closes happen — the live,
 * incremental twin of the backtest's `matchRoundTrips` (same conventions:
 * sells with no inventory open negative lots; fees attach to the fill).
 *
 * Fill prices are estimates: live market orders report no fill price, so the
 * caller passes the limit price used (slippage-adjusted quote). Documented
 * at the call site, not hidden here.
 */

export interface CopyLot {
  /** Signed token qty (+long, -short). */
  qty: number;
  /** Signed cash flow for the full lot (+received, -paid, incl. its fee). */
  cash: number;
}

export interface CopyClose {
  /** Tokens closed by this fill (0 when it only opened inventory). */
  closedSize: number;
  /** Realized PnL from the closed portion (USDC). */
  realizedUsd: number;
}

export class CopyPnlTracker {
  private lots = new Map<string, CopyLot[]>();
  totalRealizedUsd = 0;

  /**
   * Record one executed copy fill. Returns what this fill closed.
   * @param sizeTokens token qty filled (always positive)
   * @param pricePerToken estimated fill price (limit used)
   * @param feeUsd taker-fee estimate for this fill
   */
  recordFill(
    tokenId: string,
    side: 'BUY' | 'SELL',
    sizeTokens: number,
    pricePerToken: number,
    feeUsd: number
  ): CopyClose {
    if (!(sizeTokens > 0) || !(pricePerToken > 0)) return { closedSize: 0, realizedUsd: 0 };
    const key = tokenId.toLowerCase();
    const queue = this.lots.get(key) ?? [];
    // Signed fill: BUY pays cash, SELL receives cash (minus fee each way).
    let qty = side === 'BUY' ? sizeTokens : -sizeTokens;
    let cash = side === 'BUY'
      ? -(sizeTokens * pricePerToken + feeUsd)
      : sizeTokens * pricePerToken - feeUsd;
    let closedSize = 0;
    let realizedUsd = 0;

    while (qty !== 0) {
      const top = queue[0];
      if (!top || Math.sign(top.qty) === Math.sign(qty)) {
        queue.push({ qty, cash });
        qty = 0;
        cash = 0;
      } else {
        const m = Math.min(Math.abs(qty), Math.abs(top.qty));
        const frac = m / Math.abs(top.qty);
        // Closing `m` units: realize this fill's cash portion + the lot's.
        const fillPortion = cash * (m / Math.abs(qty));
        realizedUsd += fillPortion + top.cash * frac;
        top.qty += Math.sign(qty) * m;
        top.cash *= 1 - frac;
        qty -= Math.sign(qty) * m;
        cash -= fillPortion;
        closedSize += m;
        if (top.qty === 0) queue.shift();
      }
    }

    if (queue.length > 0) this.lots.set(key, queue);
    else this.lots.delete(key);
    this.totalRealizedUsd += realizedUsd;
    return { closedSize, realizedUsd };
  }

  /** Open lots per token (debug/introspection only). */
  openLots(tokenId: string): CopyLot[] {
    return [...(this.lots.get(tokenId.toLowerCase()) ?? [])];
  }
}

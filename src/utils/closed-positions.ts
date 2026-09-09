/**
 * Shared closed-position scoring input (AUDIT #1).
 *
 * Wallet quality must be scored on REALIZED PnL from closed positions, not
 * on open positions whose `cashPnl` is unrealized mark-to-market. Both app
 * entry points use this helper so the sample (newest-first, bounded) is
 * identical. Newest-first also preserves the `computeWalletQualityFromPositions`
 * contract, which scores slice(0, N) as "recent".
 */

import type { DataApiClient } from '../clients/data-api.js';
import type { PnlPosition } from './risk.js';

/** Upper bound per wallet: covers the 30-trade gate minimum with headroom. */
export const MAX_CLOSED_FOR_SCORING = 500;

const PAGE = 50;

export async function fetchClosedPnls(
  dataApi: Pick<DataApiClient, 'getClosedPositions'>,
  address: string,
  max: number = MAX_CLOSED_FOR_SCORING
): Promise<PnlPosition[]> {
  const out: PnlPosition[] = [];
  let offset = 0;
  while (out.length < max) {
    const rows = await dataApi.getClosedPositions(address, {
      limit: PAGE,
      offset,
      sortBy: 'TIMESTAMP',
      sortDirection: 'DESC',
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      out.push({ cashPnl: r.realizedPnl });
      if (out.length >= max) break;
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

/**
 * Pendulum V3 `book` rows → snapshots.jsonl
 *
 * Usage:
 *   # 1. Export per-market book rows with the DuckDB CLI (hour files are
 *   #    ~900MB — always filter to one market):
 *   duckdb -c "COPY (SELECT epoch_ms(timestamp) AS ts_ms, hex(market) AS market,
 *     hex(asset_id) AS asset, bids, asks FROM 'hour.parquet'
 *     WHERE event_type = 'book' AND market = unhex('<marketHex>')
 *     ORDER BY timestamp) TO 'rows.json' (FORMAT JSON);"
 *   # 2. Convert (asset IDs accept hex either case, 0x-prefix, or decimal):
 *   npx tsx scripts/backtest/pendulum-to-jsonl.ts rows.json snapshots.jsonl \
 *     --yes <yesAssetHex> --no <noAssetHex> [--max-levels 10]
 *   # 3. Backtest (prints trades + arb availability):
 *   npm run backtest -- snapshots.jsonl
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  pendulumBookRowsToSnapshots,
  parseBookRowsText,
  snapshotsToJsonl,
} from '../../src/backtest/pendulum.js';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [rowsFile, outFile] = positional;
const yesAsset = flag('--yes');
const noAsset = flag('--no');
const maxLevels = Number(flag('--max-levels') ?? 10);

if (!rowsFile || !outFile || !yesAsset || !noAsset) {
  console.error(
    'Usage: pendulum-to-jsonl.ts <rows.json> <snapshots.jsonl> --yes <yesAsset> --no <noAsset> [--max-levels 10]'
  );
  process.exit(1);
}

const rows = parseBookRowsText(readFileSync(rowsFile, 'utf8'));
const snapshots = pendulumBookRowsToSnapshots(rows, yesAsset, noAsset, { maxLevels });
writeFileSync(outFile, snapshotsToJsonl(snapshots));
console.log(`Wrote ${snapshots.length} snapshots to ${outFile}`);

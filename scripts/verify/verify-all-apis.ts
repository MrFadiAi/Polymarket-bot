/**
 * Verify all Polymarket API responses against SDK type definitions
 *
 * Run: pnpm -F @catalyst-team/poly-sdk tsx scripts/verify-all-apis.ts
 */

const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// Known active wallet for testing
const TEST_WALLET = '0x1c579085b4dcdf00f0ce6f2d8c1d402fec0f1632';

interface FieldAnalysis {
  field: string;
  type: string;
  sample: unknown;
  isNull: boolean;
}

function analyzeFields(obj: Record<string, unknown>, prefix = ''): FieldAnalysis[] {
  const results: FieldAnalysis[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    results.push({
      field: fieldPath,
      type,
      sample: type === 'object' ? '[object]' : type === 'array' ? `[${(value as unknown[]).length} items]` : value,
      isNull: value === null,
    });
    if (type === 'object' && value !== null) {
      results.push(...analyzeFields(value as Record<string, unknown>, fieldPath));
    }
  }
  return results;
}

async function fetchAndAnalyze(name: string, url: string, extractFirst = true) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`API: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`ERROR: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const sample = extractFirst && Array.isArray(data) ? data[0] : data;

    if (!sample) {
      console.log('No data returned');
      return null;
    }

    console.log('\nRaw Response Sample:');
    console.log(JSON.stringify(sample, null, 2));

    console.log('\nField Analysis:');
    const fields = analyzeFields(sample as Record<string, unknown>);
    for (const f of fields) {
      const nullMarker = f.isNull ? ' [NULL]' : '';
      console.log(`  ${f.field}: ${f.type}${nullMarker}`);
    }

    return sample;
  } catch (error) {
    console.log(`ERROR: ${error}`);
    return null;
  }
}

async function main() {
  console.log('Polymarket API Verification Script');
  console.log('===================================\n');

  // ===== DATA API =====
  console.log('\n' + '#'.repeat(60));
  console.log('# DATA API');
  console.log('#'.repeat(60));

  // Positions
  await fetchAndAnalyze(
    'Positions',
    `${DATA_API}/positions?user=${TEST_WALLET}`
  );

  // Activity
  await fetchAndAnalyze(
    'Activity',
    `${DATA_API}/activity?user=${TEST_WALLET}&limit=1`
  );

  // Trades
  await fetchAndAnalyze(
    'Trades',
    `${DATA_API}/trades?limit=1`
  );

  // Leaderboard
  await fetchAndAnalyze(
    'Leaderboard',
    `${DATA_API}/v1/leaderboard?limit=1`
  );

  // ===== GAMMA API =====
  console.log('\n' + '#'.repeat(60));
  console.log('# GAMMA API');
  console.log('#'.repeat(60));

  // Markets
  const market = await fetchAndAnalyze(
    'Markets',
    `${GAMMA_API}/markets?active=true&limit=1`
  );

  // Events
  await fetchAndAnalyze(
    'Events',
    `${GAMMA_API}/events?active=true&limit=1`
  );

  // ===== CLOB API =====
  console.log('\n' + '#'.repeat(60));
  console.log('# CLOB API');
  console.log('#'.repeat(60));

  // Get a conditionId from gamma market
  const conditionId = (market as Record<string, unknown>)?.conditionId;
  if (conditionId) {
    // Market
    const clobMarket = await fetchAndAnalyze(
      'CLOB Market',
      `${CLOB_API}/markets/${conditionId}`,
      false
    );

    // Orderbook
    const tokens = (clobMarket as Record<string, unknown>)?.tokens as Array<{ token_id: string }>;
    if (tokens?.[0]) {
      await fetchAndAnalyze(
        'Orderbook',
        `${CLOB_API}/book?token_id=${tokens[0].token_id}`,
        false
      );
    }
  }

  // ===== SUMMARY =====
  console.log('\n' + '#'.repeat(60));
  console.log('# VERIFICATION COMPLETE');
  console.log('#'.repeat(60));
  console.log('\nReview the output above to compare with SDK type definitions.');
}

main().catch(console.error);

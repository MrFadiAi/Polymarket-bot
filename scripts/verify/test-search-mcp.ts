/**
 * Test Search Markets MCP Tool
 *
 * Verify the improved search functionality.
 */

import { PolymarketSDK } from '../src/index.js';
import { createMcpHandler } from '../src/mcp/index.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           TEST: search_markets MCP TOOL                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const sdk = new PolymarketSDK();
  const handler = createMcpHandler(sdk);

  // Test 1: Search for "bitcoin"
  console.log('--- Test 1: Search for "bitcoin" ---');
  try {
    const result = await handler('search_markets', {
      query: 'bitcoin',
      limit: 5,
    });

    console.log('Results:');
    const data = result as { markets: Array<{ question: string; volume24h: number }>; total: number };
    data.markets.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.question}`);
      console.log(`     24h Volume: $${m.volume24h?.toLocaleString() || 'N/A'}`);
    });
    console.log(`\nTotal matches: ${data.total}`);
  } catch (err) {
    console.log(`Error: ${err}`);
  }

  // Test 2: Search for "trump"
  console.log('\n--- Test 2: Search for "trump" ---');
  try {
    const result = await handler('search_markets', {
      query: 'trump',
      limit: 5,
    });

    const data = result as { markets: Array<{ question: string; volume24h: number }>; total: number };
    data.markets.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.question}`);
      console.log(`     24h Volume: $${m.volume24h?.toLocaleString() || 'N/A'}`);
    });
    console.log(`\nTotal matches: ${data.total}`);
  } catch (err) {
    console.log(`Error: ${err}`);
  }

  // Test 3: Search with category filter
  console.log('\n--- Test 3: Search "price" with Crypto category ---');
  try {
    const result = await handler('search_markets', {
      query: 'price',
      category: 'Crypto',
      limit: 5,
    });

    const data = result as { markets: Array<{ question: string; volume24h: number }>; total: number };
    data.markets.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.question}`);
    });
    console.log(`\nTotal matches: ${data.total}`);
  } catch (err) {
    console.log(`Error: ${err}`);
  }

  // Test 4: Multi-word search
  console.log('\n--- Test 4: Multi-word search "fed interest rate" ---');
  try {
    const result = await handler('search_markets', {
      query: 'fed interest rate',
      limit: 5,
    });

    const data = result as { markets: Array<{ question: string; volume24h: number }>; total: number };
    data.markets.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.question}`);
      console.log(`     24h Volume: $${m.volume24h?.toLocaleString() || 'N/A'}`);
    });
    console.log(`\nTotal matches: ${data.total}`);
  } catch (err) {
    console.log(`Error: ${err}`);
  }

  // Test 5: Trending markets
  console.log('\n--- Test 5: Trending markets (for comparison) ---');
  try {
    const result = await handler('get_trending_markets', {
      limit: 5,
      sortBy: 'volume',
    });

    const data = result as { markets: Array<{ question: string; volume24h: number }> };
    data.markets.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.question}`);
      console.log(`     24h Volume: $${m.volume24h?.toLocaleString() || 'N/A'}`);
    });
  } catch (err) {
    console.log(`Error: ${err}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('TEST COMPLETE');
  console.log('═'.repeat(60));
}

main().catch(console.error);

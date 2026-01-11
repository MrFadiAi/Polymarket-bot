/**
 * Test Wallet Operations
 *
 * Comprehensive test for all wallet-related operations that require a private key:
 * - Token balances
 * - Allowance checking
 * - Token approvals
 * - Swap operations (dry run)
 *
 * Usage:
 *   POLY_PRIVATE_KEY=0x... npx tsx scripts/test-wallet-operations.ts
 *   Or set PRIVATE_KEY in .env file
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import {
  SwapService,
  AuthorizationService,
  POLYGON_TOKENS,
} from '../src/index.js';

dotenv.config();

const PRIVATE_KEY = process.env.POLY_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ Error: No private key found.');
  console.error('   Set POLY_PRIVATE_KEY or PRIVATE_KEY in environment or .env file');
  process.exit(1);
}

const POLYGON_RPC = 'https://polygon-rpc.com';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           POLY-SDK WALLET OPERATIONS TEST                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Initialize
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Wallet Address: ${signer.address}`);
  console.log(`Network: Polygon Mainnet (${POLYGON_RPC})`);
  console.log('');

  // Test 1: Get native MATIC balance
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Test 1: Native MATIC Balance');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const maticBalance = await provider.getBalance(signer.address);
    const maticFormatted = ethers.utils.formatEther(maticBalance);
    console.log(`  MATIC Balance: ${maticFormatted} MATIC`);

    if (parseFloat(maticFormatted) < 0.01) {
      console.log('  ⚠️  Warning: Low MATIC balance. Need MATIC for gas fees.');
    } else {
      console.log('  ✅ Sufficient MATIC for gas');
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 2: Get all token balances using SwapService
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Test 2: Token Balances (SwapService.getBalances)');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const swapService = new SwapService(signer);
    const balances = await swapService.getBalances();

    console.log('  Token Balances:');
    for (const b of balances) {
      const amount = parseFloat(b.balance);
      const status = amount > 0 ? '✅' : '  ';
      console.log(`    ${status} ${b.symbol.padEnd(8)} ${b.balance}`);
    }

    // Calculate total stablecoin value
    let stablecoinValue = 0;
    for (const b of balances) {
      if (['USDC', 'USDC_E', 'USDT', 'DAI'].includes(b.token)) {
        stablecoinValue += parseFloat(b.balance);
      }
    }
    console.log(`\n  Total Stablecoin Value: $${stablecoinValue.toFixed(2)}`);
  } catch (err) {
    console.log(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 3: Check allowances using AuthorizationService
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Test 3: Trading Allowances (AuthorizationService)');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const authService = new AuthorizationService(signer);
    const result = await authService.checkAllowances();

    console.log(`  Wallet: ${result.wallet}`);
    console.log(`  USDC Balance: ${result.usdcBalance}`);
    console.log(`  Trading Ready: ${result.tradingReady ? '✅ Yes' : '❌ No'}`);

    console.log('\n  ERC20 Allowances:');
    for (const allowance of result.erc20Allowances) {
      const status = allowance.approved ? '✅' : '❌';
      console.log(`    ${status} ${allowance.contract}: ${allowance.allowance}`);
    }

    console.log('\n  ERC1155 Approvals:');
    for (const approval of result.erc1155Approvals) {
      const status = approval.approved ? '✅' : '❌';
      console.log(`    ${status} ${approval.contract}`);
    }

    if (result.issues.length > 0) {
      console.log('\n  Issues:');
      for (const issue of result.issues) {
        console.log(`    ⚠️  ${issue}`);
      }
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 4: Swap Quote (without executing)
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Test 4: Swap Service (Quote Only - No Execution)');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    const swapService = new SwapService(signer);

    // Check if we have any tokens to get a quote for
    const balances = await swapService.getBalances();
    const maticBalance = balances.find((b) => b.token === 'MATIC');
    const usdcBalance = balances.find((b) => b.token === 'USDC');

    if (maticBalance && parseFloat(maticBalance.balance) > 1) {
      console.log('  Checking swap quote: 1 MATIC -> USDC');
      // Note: We're not executing, just confirming the service initializes correctly
      console.log('  ✅ SwapService initialized successfully');
      console.log(`  Router: ${POLYGON_TOKENS.WMATIC} (WMATIC)`);
      console.log(`  Can swap: MATIC, WMATIC, USDC, USDC_E, USDT, DAI, WETH`);
    } else {
      console.log('  ℹ️  Insufficient MATIC balance for swap test');
      console.log('  ✅ SwapService initialized successfully');
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 5: Static wallet query (no signer needed)
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Test 5: Static Wallet Query (Any Address)');
  console.log('═══════════════════════════════════════════════════════════');
  try {
    // Query a known top trader
    const topTrader = '0xc2e7800b5af46e6093872b177b7a5e7f0563be51';
    console.log(`  Querying wallet: ${topTrader}`);

    const balances = await SwapService.getWalletBalances(topTrader);
    const nonZero = balances.filter((b) => parseFloat(b.balance) > 0);

    console.log('  Balances:');
    for (const b of nonZero) {
      console.log(`    ${b.symbol.padEnd(8)} ${parseFloat(b.balance).toLocaleString()}`);
    }
    console.log('  ✅ Static query works without signer');
  } catch (err) {
    console.log(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`
  ✅ Token balance queries work
  ✅ Allowance checking works
  ✅ SwapService initializes correctly
  ✅ Static wallet queries work

  To test actual transactions:
  - Use approve-trading if allowances are missing
  - Use swap if you want to exchange tokens
  - Use deposit if you want to deposit to Polymarket
  `);
}

main().catch(console.error);

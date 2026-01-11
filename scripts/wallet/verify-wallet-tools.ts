/**
 * Verify Wallet Tools Implementation
 *
 * This script tests the wallet-related SDK and MCP tools:
 * 1. BridgeClient.getSupportedAssets() - Get supported deposit assets
 * 2. BridgeClient.createDepositAddresses() - Get deposit addresses
 * 3. AuthorizationService.checkAllowances() - Check allowances
 *
 * Usage:
 *   npx tsx scripts/verify-wallet-tools.ts
 *   POLY_PRIVKEY=0x... npx tsx scripts/verify-wallet-tools.ts
 */

import { Wallet, providers } from 'ethers';
import { BridgeClient, AuthorizationService } from '../src/index.js';

const PRIVATE_KEY = process.env.POLY_PRIVKEY || process.env.POLY_PRIVATE_KEY;
const RPC_URL = 'https://polygon-rpc.com';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          WALLET TOOLS VERIFICATION                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Test 1: Get Supported Assets
  console.log('─── Test 1: BridgeClient.getSupportedAssets() ───');
  try {
    const bridge = new BridgeClient();
    const assets = await bridge.getSupportedAssets();
    console.log(`✅ Found ${assets.length} supported assets`);

    // Group by chain
    const chains = new Set<string>();
    for (const asset of assets) {
      chains.add(asset.chainName);
    }
    console.log(`   Chains: ${Array.from(chains).join(', ')}`);

    // Show first 3 assets as sample
    console.log('   Sample assets:');
    for (const asset of assets.slice(0, 3)) {
      console.log(`   - ${asset.chainName} ${asset.tokenSymbol}: min $${asset.minDepositUsd}`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err instanceof Error ? err.message : err}`);
  }
  console.log('');

  // Test 2: Get Deposit Addresses (requires address, not private key)
  console.log('─── Test 2: BridgeClient.createDepositAddresses() ───');
  try {
    const bridge = new BridgeClient();
    // Use a test address
    const testAddress = '0xc2e7800b5af46e6093872b177b7a5e7f0563be51';
    const result = await bridge.createDepositAddresses(testAddress);
    console.log(`✅ Got deposit addresses for ${testAddress.slice(0, 10)}...`);
    console.log(`   EVM: ${result.address.evm.slice(0, 20)}...`);
    console.log(`   Solana: ${result.address.svm.slice(0, 20)}...`);
    console.log(`   Bitcoin: ${result.address.btc.slice(0, 20)}...`);
  } catch (err) {
    console.log(`❌ Error: ${err instanceof Error ? err.message : err}`);
  }
  console.log('');

  // Test 3: Check Allowances (requires private key)
  console.log('─── Test 3: AuthorizationService.checkAllowances() ───');
  if (!PRIVATE_KEY) {
    console.log('⚠️  Skipped: Set POLY_PRIVKEY to test allowance checking');
  } else {
    try {
      const provider = new providers.JsonRpcProvider(RPC_URL);
      const wallet = new Wallet(PRIVATE_KEY, provider);
      console.log(`   Wallet: ${wallet.address}`);

      const authService = new AuthorizationService(wallet);
      const result = await authService.checkAllowances();

      console.log(`✅ Allowance check completed`);
      console.log(`   USDC Balance: ${result.usdcBalance}`);
      console.log(`   Trading Ready: ${result.tradingReady ? '✅ Yes' : '❌ No'}`);

      if (result.issues.length > 0) {
        console.log('   Issues:');
        for (const issue of result.issues) {
          console.log(`   - ${issue}`);
        }
      }

      console.log('   ERC20 Allowances:');
      for (const a of result.erc20Allowances) {
        console.log(`   - ${a.contract}: ${a.approved ? '✅' : '❌'} (${a.allowance || 'N/A'})`);
      }

      console.log('   ERC1155 Approvals:');
      for (const a of result.erc1155Approvals) {
        console.log(`   - ${a.contract}: ${a.approved ? '✅' : '❌'}`);
      }
    } catch (err) {
      console.log(`❌ Error: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Verification complete.');
  console.log('');
  console.log('Architecture:');
  console.log('  SDK Layer:');
  console.log('    - BridgeClient.getSupportedAssets()');
  console.log('    - BridgeClient.createDepositAddresses()');
  console.log('    - depositUsdc() function');
  console.log('    - AuthorizationService.checkAllowances()');
  console.log('    - AuthorizationService.approveAll()');
  console.log('');
  console.log('  MCP Tools (call SDK):');
  console.log('    - get_supported_deposit_assets → BridgeClient');
  console.log('    - get_deposit_addresses → BridgeClient');
  console.log('    - deposit_usdc → depositUsdc()');
  console.log('    - check_allowances → AuthorizationService');
  console.log('    - approve_trading → AuthorizationService');
}

main().catch(console.error);

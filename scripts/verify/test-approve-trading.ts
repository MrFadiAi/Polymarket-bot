/**
 * Test Approve Trading
 *
 * Approve all required contracts for trading on Polymarket.
 * This will send real transactions!
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx scripts/test-approve-trading.ts
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { AuthorizationService } from '../src/index.js';

dotenv.config();

const PRIVATE_KEY = process.env.POLY_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ Error: No private key found.');
  process.exit(1);
}

const POLYGON_RPC = 'https://polygon-rpc.com';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           APPROVE TRADING TEST                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Wallet: ${signer.address}`);

  // Check current balance for gas
  const balance = await provider.getBalance(signer.address);
  const maticBalance = ethers.utils.formatEther(balance);
  console.log(`MATIC Balance: ${maticBalance}\n`);

  if (parseFloat(maticBalance) < 0.1) {
    console.error('❌ Insufficient MATIC for gas. Need at least 0.1 MATIC');
    process.exit(1);
  }

  const authService = new AuthorizationService(signer);

  // Check current state
  console.log('Checking current allowances...');
  const before = await authService.checkAllowances();
  console.log(`Trading Ready: ${before.tradingReady ? '✅' : '❌'}\n`);

  if (before.tradingReady) {
    console.log('✅ Already ready for trading. No approvals needed.');
    return;
  }

  // Approve all
  console.log('Approving all contracts...\n');

  try {
    const result = await authService.approveAll();

    console.log('Results:');
    console.log(`  Wallet: ${result.wallet}`);
    console.log(`  All Approved: ${result.allApproved ? '✅' : '❌'}`);

    console.log('\n  ERC20 Approvals:');
    for (const approval of result.erc20Approvals) {
      const status = approval.success ? '✅' : '❌';
      console.log(`    ${status} ${approval.contract}`);
      if (approval.txHash) {
        console.log(`       TX: https://polygonscan.com/tx/${approval.txHash}`);
      }
      if (approval.error) {
        console.log(`       Error: ${approval.error}`);
      }
    }

    console.log('\n  ERC1155 Approvals:');
    for (const approval of result.erc1155Approvals) {
      const status = approval.success ? '✅' : '❌';
      console.log(`    ${status} ${approval.contract}`);
      if (approval.txHash) {
        console.log(`       TX: https://polygonscan.com/tx/${approval.txHash}`);
      }
      if (approval.error) {
        console.log(`       Error: ${approval.error}`);
      }
    }

    console.log(`\n${result.summary}`);
  } catch (err) {
    console.error(`\n❌ Error: ${err instanceof Error ? err.message : err}`);
  }
}

main().catch(console.error);

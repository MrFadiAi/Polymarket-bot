#!/usr/bin/env npx tsx
/**
 * Polymarket Deposit Tool
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx scripts/deposit/deposit.ts [command] [amount]
 *
 * Commands:
 *   check              - Check balances and allowances (default)
 *   approve            - Set up all trading approvals
 *   swap <amount>      - Swap Native USDC to USDC.e
 *   deposit <amount>   - Deposit Native USDC to Polymarket
 */

import { OnchainService, depositUsdc } from '../../src/index.js';
import { Wallet, providers } from 'ethers';

const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.POLY_PRIVKEY || '';

async function main() {
  if (!PRIVATE_KEY) {
    console.log('Usage: PRIVATE_KEY=0x... npx tsx scripts/deposit/deposit.ts [check|approve|swap|deposit] [amount]');
    process.exit(1);
  }

  const [command = 'check', amountStr] = process.argv.slice(2);
  const amount = amountStr ? parseFloat(amountStr) : 0;

  const onchain = new OnchainService({ privateKey: PRIVATE_KEY });
  const provider = new providers.JsonRpcProvider('https://polygon-rpc.com');
  const wallet = new Wallet(PRIVATE_KEY, provider);

  console.log(`\nWallet: ${onchain.getAddress()}\n`);

  switch (command) {
    case 'check': {
      const balances = await onchain.getTokenBalances();
      console.log('Balances:');
      console.log(`  MATIC:       ${balances.matic}`);
      console.log(`  Native USDC: ${balances.usdc}`);
      console.log(`  USDC.e:      ${balances.usdcE}`);

      const allowances = await onchain.checkAllowances();
      console.log(`\nTrading Ready: ${allowances.tradingReady ? '✓' : '✗'}`);
      if (allowances.issues.length > 0) {
        console.log('Issues:', allowances.issues.join(', '));
      }
      break;
    }

    case 'approve': {
      console.log('Setting up trading approvals...');
      const result = await onchain.approveAll();
      console.log(`Done. ${result.summary}`);
      break;
    }

    case 'swap': {
      if (amount <= 0) {
        console.log('Usage: swap <amount>');
        process.exit(1);
      }
      console.log(`Swapping ${amount} USDC → USDC.e...`);
      const result = await onchain.swap('USDC', 'USDC_E', amount.toString());
      console.log(`TX: ${result.transactionHash}`);
      console.log(`Received: ${result.amountOut} USDC.e`);
      break;
    }

    case 'deposit': {
      if (amount < 2) {
        console.log('Minimum deposit: $2');
        process.exit(1);
      }
      console.log(`Depositing ${amount} USDC to Polymarket...`);
      const result = await depositUsdc(wallet, amount, { token: 'NATIVE_USDC' });
      if (result.success) {
        console.log(`TX: ${result.txHash}`);
        console.log('Bridge will process in 1-5 minutes.');
      } else {
        console.log(`Error: ${result.error}`);
      }
      break;
    }

    default:
      console.log('Unknown command. Use: check, approve, swap, deposit');
  }
}

main().catch(console.error);

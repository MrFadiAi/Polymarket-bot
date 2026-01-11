#!/usr/bin/env npx tsx
/**
 * Check all Polymarket contract allowances
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read private key from dashboard-api .env
const envPath = path.resolve(__dirname, '../../earning-engine/dashboard-api/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^PRIVATE_KEY=(.+)$/m);
const PRIVATE_KEY = match ? match[1].trim() : '';

if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY not found in .env');
  process.exit(1);
}

// Contract addresses on Polygon
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

// Additional contracts that might need approval
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       POLYMARKET ALLOWANCE CHECKER (ALL CONTRACTS)              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Use multiple RPC providers for reliability
  const rpcUrls = [
    'https://polygon-mainnet.g.alchemy.com/v2/demo',
    'https://polygon.llamarpc.com',
    'https://polygon-rpc.com',
  ];

  let provider: ethers.providers.JsonRpcProvider | null = null;
  for (const rpcUrl of rpcUrls) {
    try {
      const p = new ethers.providers.JsonRpcProvider(rpcUrl);
      await p.getNetwork(); // Test connection
      provider = p;
      console.log(`Using RPC: ${rpcUrl}`);
      break;
    } catch (e) {
      console.log(`RPC failed: ${rpcUrl}`);
    }
  }

  if (!provider) {
    console.error('All RPC providers failed!');
    process.exit(1);
  }
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const address = wallet.address;
  const usdc = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, wallet);

  console.log(`Wallet: ${address}`);
  console.log('');

  // Check USDC balance
  const balance = await usdc.balanceOf(address);
  console.log(`USDC.e Balance: ${(parseFloat(balance.toString()) / 1e6).toFixed(6)} USDC`);
  console.log('');

  // Check all allowances
  console.log('─── Contract Allowances ───');

  const contracts = [
    { name: 'CTF Exchange', address: CTF_EXCHANGE },
    { name: 'Neg Risk CTF Exchange', address: NEG_RISK_CTF_EXCHANGE },
    { name: 'Neg Risk Adapter', address: NEG_RISK_ADAPTER },
    { name: 'Conditional Tokens', address: CONDITIONAL_TOKENS },
  ];

  let needsApproval = [];

  for (const contract of contracts) {
    const allowance = await usdc.allowance(address, contract.address);
    const allowanceNum = parseFloat(allowance.toString()) / 1e6;
    const isUnlimited = allowanceNum > 1e12;
    const status = isUnlimited ? '✅ Unlimited' : allowanceNum > 0 ? `⚠️ ${allowanceNum.toFixed(2)}` : '❌ None';
    console.log(`${contract.name}: ${status}`);
    if (!isUnlimited) {
      needsApproval.push(contract);
    }
  }

  console.log('');

  if (needsApproval.length > 0) {
    console.log('─── Approval Needed ───');
    console.log('The following contracts need unlimited approval:');
    for (const contract of needsApproval) {
      console.log(`  - ${contract.name} (${contract.address})`);
    }
    console.log('');
    console.log('Run with --approve flag to approve all:');
    console.log('  npx tsx scripts/check-all-allowances.ts --approve');
    console.log('');

    if (process.argv.includes('--approve')) {
      console.log('─── Approving Contracts ───');
      const MAX_UINT256 = ethers.constants.MaxUint256;

      // Get current gas price and add buffer for Polygon
      const gasPrice = await provider.getGasPrice();
      const adjustedGasPrice = gasPrice.mul(150).div(100); // 1.5x current gas price
      console.log(`Using gas price: ${(adjustedGasPrice.toNumber() / 1e9).toFixed(2)} Gwei`);

      for (const contract of needsApproval) {
        console.log(`Approving ${contract.name}...`);
        try {
          const tx = await usdc.approve(contract.address, MAX_UINT256, { gasPrice: adjustedGasPrice });
          console.log(`  TX: ${tx.hash}`);
          await tx.wait();
          console.log(`  ✓ Approved`);
        } catch (error: any) {
          console.log(`  ✗ Failed: ${error.message}`);
        }
      }
      console.log('');
      console.log('✅ Done! Please re-run without --approve to verify.');
    }
  } else {
    console.log('✅ All contracts have unlimited approval!');
    console.log('');
    console.log('If orders are still failing, the issue may be:');
    console.log('1. Polymarket requires a deposit via their UI to create a trading account');
    console.log('2. Or there may be a different issue with the API key');
  }
}

main().catch(console.error);

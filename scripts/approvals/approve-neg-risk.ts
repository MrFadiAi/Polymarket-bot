#!/usr/bin/env npx tsx
/**
 * Simple script to approve Neg Risk Adapter
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read private key
const envPath = path.resolve(__dirname, '../../earning-engine/dashboard-api/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^PRIVATE_KEY=(.+)$/m);
const PRIVATE_KEY = match ? match[1].trim() : '';

if (!PRIVATE_KEY) {
  console.error('PRIVATE_KEY not found');
  process.exit(1);
}

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

async function main() {
  console.log('Approving Neg Risk Adapter...');

  // Try multiple RPCs
  const rpcs = [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://polygon-rpc.com',
  ];

  for (const rpc of rpcs) {
    console.log(`\nTrying RPC: ${rpc}`);
    try {
      const provider = new ethers.providers.JsonRpcProvider({
        url: rpc,
        timeout: 30000,
      });

      // Test connection
      const network = await provider.getNetwork();
      console.log(`Connected to chain ${network.chainId}`);

      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      console.log(`Wallet: ${wallet.address}`);

      const usdc = new ethers.Contract(USDC_E, ERC20_ABI, wallet);

      // Check current allowance
      const currentAllowance = await usdc.allowance(wallet.address, NEG_RISK_ADAPTER);
      console.log(`Current allowance: ${ethers.utils.formatUnits(currentAllowance, 6)} USDC`);

      if (currentAllowance.gt(ethers.utils.parseUnits('1000000000', 6))) {
        console.log('✅ Already approved!');
        return;
      }

      // Get gas price
      const gasPrice = await provider.getGasPrice();
      const adjustedGas = gasPrice.mul(2); // 2x for safety
      console.log(`Gas price: ${ethers.utils.formatUnits(adjustedGas, 'gwei')} Gwei`);

      // Approve
      console.log('Sending approval transaction...');
      const tx = await usdc.approve(NEG_RISK_ADAPTER, ethers.constants.MaxUint256, {
        gasPrice: adjustedGas,
        gasLimit: 100000,
      });

      console.log(`TX Hash: ${tx.hash}`);
      console.log('Waiting for confirmation...');

      const receipt = await tx.wait();
      console.log(`✅ Confirmed in block ${receipt.blockNumber}`);

      // Verify
      const newAllowance = await usdc.allowance(wallet.address, NEG_RISK_ADAPTER);
      console.log(`New allowance: Unlimited`);

      return;
    } catch (error: any) {
      console.log(`Failed: ${error.message}`);
    }
  }

  console.log('\n❌ All RPCs failed!');
  console.log('Please approve manually on Polygonscan:');
  console.log('https://polygonscan.com/token/0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174#writeContract');
}

main().catch(console.error);

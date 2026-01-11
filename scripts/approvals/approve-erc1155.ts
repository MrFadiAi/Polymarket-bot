#!/usr/bin/env npx tsx
/**
 * Approve ERC1155 for selling YES/NO tokens
 *
 * This sets setApprovalForAll on the Conditional Tokens contract
 * to allow the exchanges to transfer your YES/NO tokens.
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

// Contract addresses
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

const ERC1155_ABI = [
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       ERC1155 APPROVAL FOR SELLING YES/NO TOKENS                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const rpcs = [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://polygon-rpc.com',
  ];

  for (const rpc of rpcs) {
    console.log(`Trying RPC: ${rpc}`);
    try {
      const provider = new ethers.providers.JsonRpcProvider({
        url: rpc,
        timeout: 30000,
      });

      const network = await provider.getNetwork();
      console.log(`Connected to chain ${network.chainId}`);

      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      console.log(`Wallet: ${wallet.address}`);
      console.log('');

      const conditionalTokens = new ethers.Contract(CONDITIONAL_TOKENS, ERC1155_ABI, wallet);

      const operators = [
        { name: 'CTF Exchange', address: CTF_EXCHANGE },
        { name: 'Neg Risk CTF Exchange', address: NEG_RISK_CTF_EXCHANGE },
      ];

      // Check current approvals
      console.log('─── Current ERC1155 Approvals ───');
      let needsApproval = [];

      for (const op of operators) {
        const isApproved = await conditionalTokens.isApprovedForAll(wallet.address, op.address);
        console.log(`${op.name}: ${isApproved ? '✅ Approved' : '❌ Not Approved'}`);
        if (!isApproved) {
          needsApproval.push(op);
        }
      }
      console.log('');

      if (needsApproval.length === 0) {
        console.log('✅ All ERC1155 approvals are set!');
        return;
      }

      // Approve missing operators
      console.log('─── Setting Approvals ───');
      const gasPrice = await provider.getGasPrice();
      const adjustedGas = gasPrice.mul(2);
      console.log(`Gas price: ${ethers.utils.formatUnits(adjustedGas, 'gwei')} Gwei`);
      console.log('');

      for (const op of needsApproval) {
        console.log(`Approving ${op.name}...`);
        try {
          const tx = await conditionalTokens.setApprovalForAll(op.address, true, {
            gasPrice: adjustedGas,
            gasLimit: 100000,
          });
          console.log(`  TX: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
        } catch (error: any) {
          console.log(`  ❌ Failed: ${error.message}`);
        }
      }

      console.log('');
      console.log('─── Verifying Approvals ───');
      for (const op of operators) {
        const isApproved = await conditionalTokens.isApprovedForAll(wallet.address, op.address);
        console.log(`${op.name}: ${isApproved ? '✅ Approved' : '❌ Not Approved'}`);
      }

      return;
    } catch (error: any) {
      console.log(`Failed: ${error.message}`);
      console.log('');
    }
  }

  console.log('❌ All RPCs failed!');
}

main().catch(console.error);

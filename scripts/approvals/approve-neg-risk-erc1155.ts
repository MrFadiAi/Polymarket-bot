#!/usr/bin/env npx tsx
/**
 * Check and Approve ERC1155 for Neg Risk Adapter
 *
 * 检查并授权 Neg Risk Adapter 的 ERC1155 转账权限
 * 这可能是 SELL 订单在 Neg Risk 市场失败的原因
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
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

const ERC1155_ABI = [
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   NEG RISK ERC1155 AUTHORIZATION CHECK                          ║');
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

      // All operators to check
      const operators = [
        { name: 'CTF Exchange', address: CTF_EXCHANGE },
        { name: 'Neg Risk CTF Exchange', address: NEG_RISK_CTF_EXCHANGE },
        { name: 'Neg Risk Adapter', address: NEG_RISK_ADAPTER },
      ];

      // Check current approvals
      console.log('─── Current ERC1155 Approvals (Conditional Tokens) ───');
      let needsApproval = [];

      for (const op of operators) {
        const isApproved = await conditionalTokens.isApprovedForAll(wallet.address, op.address);
        console.log(`${op.name}: ${isApproved ? '✅ Approved' : '❌ Not Approved'}`);
        if (!isApproved) {
          needsApproval.push(op);
        }
      }
      console.log('');

      // Check token balances (YES and NO for NVIDIA market)
      const yesTokenId = '94850533403292240972948844256810904078895883844462287088135166537739765648754';
      const noTokenId = '69263280792958981516606123639467754139758192236863611059536531765186180114584';

      console.log('─── Token Balances ───');
      const yesBalance = await conditionalTokens.balanceOf(wallet.address, yesTokenId);
      const noBalance = await conditionalTokens.balanceOf(wallet.address, noTokenId);
      console.log(`YES Token: ${ethers.utils.formatUnits(yesBalance, 6)} tokens`);
      console.log(`NO Token: ${ethers.utils.formatUnits(noBalance, 6)} tokens`);
      console.log('');

      if (needsApproval.length === 0) {
        console.log('✅ All ERC1155 approvals are set!');
        console.log('');
        console.log('If SELL orders are still failing, the issue might be:');
        console.log('1. Neg Risk market uses wrapped tokens through the Adapter');
        console.log('2. The CLOB might require a different approval mechanism');
        console.log('3. Check if tokens need to be "unwrapped" before selling');
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

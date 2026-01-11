#!/usr/bin/env npx tsx
/**
 * Sell NVIDIA Market Positions
 *
 * Sells both YES and NO tokens from the NVIDIA market to recover USDC.
 *
 * Usage:
 *   # Dry run
 *   npx tsx scripts/sell-nvidia-positions.ts
 *
 *   # Execute
 *   npx tsx scripts/sell-nvidia-positions.ts --execute
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import {
  TradingService,
  RateLimiter,
  createUnifiedCache,
  CTFClient,
} from '../../src/index.js';

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

const EXECUTE = process.argv.includes('--execute');

// NVIDIA market token IDs (from report)
const NVIDIA_MARKET = {
  conditionId: '0x0b16eb7741855ca3d4c8293089b5a9bdf7e59a6cf7f86ab87eb59c60ca01bbcf',
  yesTokenId: '94850533403292240972948844256810904078895883844462287088135166537739765648754',
  noTokenId: '69263280792958981516606123639467754139758192236863611059536531765186180114584',
  question: 'NVIDIA largest company by market cap on Dec 31',
};

// Conditional Tokens contract ABI
const CTF_ABI = [
  'function balanceOf(address account, uint256 positionId) view returns (uint256)',
];
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              SELL NVIDIA POSITIONS                             ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Mode: ${EXECUTE ? '🔥 EXECUTE' : '👀 DRY RUN'}                                          ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const rateLimiter = new RateLimiter();
  const cache = createUnifiedCache();
  const ctf = new CTFClient({ privateKey: PRIVATE_KEY });
  const tradingService = new TradingService(rateLimiter, cache, { privateKey: PRIVATE_KEY });

  const address = ctf.getAddress();
  console.log(`Wallet: ${address}`);
  console.log(`Market: ${NVIDIA_MARKET.question}`);
  console.log('');

  // Create provider and CTF contract for balance queries
  const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
  const ctfContract = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);

  // Get current balances
  const usdcBalance = await ctf.getUsdcBalance();
  const yesBalanceRaw = await ctfContract.balanceOf(address, NVIDIA_MARKET.yesTokenId);
  const noBalanceRaw = await ctfContract.balanceOf(address, NVIDIA_MARKET.noTokenId);
  const yesBalance = ethers.utils.formatUnits(yesBalanceRaw, 6);
  const noBalance = ethers.utils.formatUnits(noBalanceRaw, 6);

  console.log('─── Current Balances ───');
  console.log(`USDC: $${parseFloat(usdcBalance).toFixed(2)}`);
  console.log(`YES:  ${parseFloat(yesBalance).toFixed(2)} tokens`);
  console.log(`NO:   ${parseFloat(noBalance).toFixed(2)} tokens`);
  console.log('');

  // Get market prices
  const orderbook = await tradingService.getProcessedOrderbook(NVIDIA_MARKET.yesTokenId);
  const yesBid = orderbook?.bids?.[0]?.price ?? 0;
  const yesAsk = orderbook?.asks?.[0]?.price ?? 1;

  const noOrderbook = await tradingService.getProcessedOrderbook(NVIDIA_MARKET.noTokenId);
  const noBid = noOrderbook?.bids?.[0]?.price ?? 0;
  const noAsk = noOrderbook?.asks?.[0]?.price ?? 1;

  console.log('─── Market Prices ───');
  console.log(`YES: bid=$${yesBid.toFixed(3)} ask=$${yesAsk.toFixed(3)}`);
  console.log(`NO:  bid=$${noBid.toFixed(3)} ask=$${noAsk.toFixed(3)}`);
  console.log('');

  const yesValue = parseFloat(yesBalance) * yesBid;
  const noValue = parseFloat(noBalance) * noBid;

  console.log('─── Expected Value (at bid prices) ───');
  console.log(`YES: ${parseFloat(yesBalance).toFixed(2)} × $${yesBid.toFixed(3)} = $${yesValue.toFixed(2)}`);
  console.log(`NO:  ${parseFloat(noBalance).toFixed(2)} × $${noBid.toFixed(3)} = $${noValue.toFixed(2)}`);
  console.log(`Total: $${(yesValue + noValue).toFixed(2)}`);
  console.log('');

  if (!EXECUTE) {
    console.log('💡 Run with --execute to sell positions:');
    console.log('   npx tsx scripts/sell-nvidia-positions.ts --execute');
    return;
  }

  // Initialize trading service
  console.log('─── Executing Trades ───');
  console.log('Initializing trading service...');
  await tradingService.initialize();
  console.log('Trading service ready.');
  console.log('');

  // Sell YES tokens if we have any
  if (parseFloat(yesBalance) >= 1) {
    console.log(`Selling ${parseFloat(yesBalance).toFixed(2)} YES tokens...`);
    try {
      const result = await tradingService.createMarketOrder({
        tokenId: NVIDIA_MARKET.yesTokenId,
        side: 'SELL',
        amount: parseFloat(yesBalance),
        orderType: 'FAK', // Fill-and-Kill allows partial fills
      });

      if (result.success) {
        console.log(`✅ YES sold! Order ID: ${result.orderId || 'N/A'}`);
        if (result.transactionHashes?.length) {
          console.log(`   TX: ${result.transactionHashes[0]}`);
        }
      } else {
        console.log(`⚠️ YES order may not have filled: ${result.errorMsg || 'Unknown'}`);
      }
    } catch (error: any) {
      console.log(`❌ YES sell failed: ${error.message}`);
    }
  } else {
    console.log('No YES tokens to sell (balance < 1)');
  }

  console.log('');

  // Sell NO tokens if we have any
  if (parseFloat(noBalance) >= 1) {
    console.log(`Selling ${parseFloat(noBalance).toFixed(2)} NO tokens...`);
    try {
      const result = await tradingService.createMarketOrder({
        tokenId: NVIDIA_MARKET.noTokenId,
        side: 'SELL',
        amount: parseFloat(noBalance),
        orderType: 'FAK', // Fill-and-Kill allows partial fills
      });

      if (result.success) {
        console.log(`✅ NO sold! Order ID: ${result.orderId || 'N/A'}`);
        if (result.transactionHashes?.length) {
          console.log(`   TX: ${result.transactionHashes[0]}`);
        }
      } else {
        console.log(`⚠️ NO order may not have filled: ${result.errorMsg || 'Unknown'}`);
      }
    } catch (error: any) {
      console.log(`❌ NO sell failed: ${error.message}`);
    }
  } else {
    console.log('No NO tokens to sell (balance < 1)');
  }

  console.log('');

  // Wait a bit for balances to update
  await new Promise((r) => setTimeout(r, 2000));

  // Get final balances
  const finalUsdc = await ctf.getUsdcBalance();
  const finalYesRaw = await ctfContract.balanceOf(address, NVIDIA_MARKET.yesTokenId);
  const finalNoRaw = await ctfContract.balanceOf(address, NVIDIA_MARKET.noTokenId);
  const finalYes = ethers.utils.formatUnits(finalYesRaw, 6);
  const finalNo = ethers.utils.formatUnits(finalNoRaw, 6);

  console.log('─── Final Balances ───');
  console.log(`USDC: $${parseFloat(finalUsdc).toFixed(2)} (${parseFloat(finalUsdc) >= parseFloat(usdcBalance) ? '+' : ''}$${(parseFloat(finalUsdc) - parseFloat(usdcBalance)).toFixed(2)})`);
  console.log(`YES:  ${parseFloat(finalYes).toFixed(2)} tokens`);
  console.log(`NO:   ${parseFloat(finalNo).toFixed(2)} tokens`);
  console.log('');

  console.log('✅ Done!');
}

main().catch(console.error);

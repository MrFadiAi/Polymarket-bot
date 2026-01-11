/**
 * Check and Set USDC.e Allowance for Polymarket Trading
 *
 * Usage:
 *   # Check current allowance
 *   POLY_PRIVKEY=0x... npx tsx scripts/check-allowance.ts
 *
 *   # Approve unlimited allowance
 *   POLY_PRIVKEY=0x... npx tsx scripts/check-allowance.ts approve
 */

import { TradingService, RateLimiter, createUnifiedCache } from '../../src/index.js';

const PRIVATE_KEY = process.env.POLY_PRIVKEY || '';

async function main() {
  if (!PRIVATE_KEY) {
    console.error('Error: Set POLY_PRIVKEY environment variable');
    process.exit(1);
  }

  const command = process.argv[2] || 'check';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       POLYMARKET ALLOWANCE CHECKER                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const rateLimiter = new RateLimiter();
  const cache = createUnifiedCache();
  const tradingService = new TradingService(rateLimiter, cache, {
    privateKey: PRIVATE_KEY,
    chainId: 137,
  });

  await tradingService.initialize();
  console.log(`Wallet: ${tradingService.getAddress()}`);
  console.log('');

  // Check current balance and allowance
  console.log('─── Current Status ───');
  const { balance, allowance } = await tradingService.getBalanceAllowance('COLLATERAL');

  const balanceUsdc = parseFloat(balance) / 1e6;
  const allowanceUsdc = allowance ? parseFloat(allowance) / 1e6 : Infinity;

  console.log(`USDC.e Balance:   ${balanceUsdc.toFixed(6)} USDC`);
  console.log(`USDC.e Allowance: ${allowance === 'unlimited' || allowanceUsdc > 1e12 ? 'Unlimited' : allowanceUsdc.toFixed(6) + ' USDC'}`);
  console.log('');

  // Check if allowance is sufficient
  if (allowanceUsdc < balanceUsdc) {
    console.log('⚠️  Warning: Allowance is less than balance!');
    console.log('   This may cause "not enough balance / allowance" errors.');
    console.log('   Run with "approve" argument to fix.');
    console.log('');
  }

  if (command === 'approve') {
    console.log('─── Approving Unlimited Allowance ───');
    console.log('This will approve unlimited USDC.e spending for Polymarket.');
    console.log('');

    try {
      // Get the underlying CLOB client to access approve methods
      const client = (tradingService as unknown as { clobClient: { approveCollateral: () => Promise<unknown> } }).clobClient;

      if (client && typeof client.approveCollateral === 'function') {
        console.log('Sending approval transaction...');
        const result = await client.approveCollateral();
        console.log('Approval result:', result);
      } else {
        // Manual approval using ethers
        console.log('Using direct contract call...');

        const { ethers } = await import('ethers');
        const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

        // USDC.e contract on Polygon
        const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
        // CTF Exchange contract (where orders are executed)
        const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
        // Neg Risk CTF Exchange
        const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

        const ERC20_ABI = [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function allowance(address owner, address spender) view returns (uint256)',
        ];

        const usdc = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, wallet);
        const MAX_UINT256 = ethers.constants.MaxUint256;

        // Approve both exchanges
        console.log('');
        console.log('1. Approving CTF Exchange...');
        const tx1 = await usdc.approve(CTF_EXCHANGE, MAX_UINT256);
        console.log(`   TX: ${tx1.hash}`);
        await tx1.wait();
        console.log('   ✓ Confirmed');

        console.log('');
        console.log('2. Approving Neg Risk CTF Exchange...');
        const tx2 = await usdc.approve(NEG_RISK_CTF_EXCHANGE, MAX_UINT256);
        console.log(`   TX: ${tx2.hash}`);
        await tx2.wait();
        console.log('   ✓ Confirmed');
      }

      console.log('');
      console.log('✅ Approval complete!');

      // Re-check allowance
      const { allowance: newAllowance } = await tradingService.getBalanceAllowance('COLLATERAL');
      console.log(`New Allowance: ${newAllowance === 'unlimited' ? 'Unlimited' : newAllowance}`);

    } catch (error) {
      console.error('❌ Approval failed:', (error as Error).message);
    }
  } else {
    console.log('─── Commands ───');
    console.log('  check   - Check current allowance (default)');
    console.log('  approve - Approve unlimited allowance for trading');
    console.log('');
    console.log('Example: POLY_PRIVKEY=0x... npx tsx scripts/check-allowance.ts approve');
  }
}

main().catch(console.error);

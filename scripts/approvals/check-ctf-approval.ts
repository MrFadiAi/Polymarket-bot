/**
 * Check and Set CTF Token Approvals for Polymarket Trading
 *
 * The CLOB Exchange requires approval for CTF tokens (ERC1155) in addition to USDC.e.
 * Without CTF token approval, orders fail with "not enough balance / allowance".
 *
 * Usage:
 *   POLY_PRIVKEY=0x... npx tsx scripts/check-ctf-approval.ts
 *   POLY_PRIVKEY=0x... npx tsx scripts/check-ctf-approval.ts approve
 */

import { ethers } from 'ethers';

const PRIVATE_KEY = process.env.POLY_PRIVKEY || '';
const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/demo';

// Contracts
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const CTF_TOKEN = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';  // Conditional Tokens (ERC1155)

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const ERC1155_ABI = [
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
];

async function main() {
  if (!PRIVATE_KEY) {
    console.error('Error: Set POLY_PRIVKEY environment variable');
    process.exit(1);
  }

  const command = process.argv[2] || 'check';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       POLYMARKET CTF APPROVAL CHECKER                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const address = wallet.address;

  console.log('Wallet:', address);
  console.log('');

  // Check USDC.e
  const usdc = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, provider);
  const balance = await usdc.balanceOf(address);
  const ctfUsdcAllowance = await usdc.allowance(address, CTF_EXCHANGE);
  const negRiskUsdcAllowance = await usdc.allowance(address, NEG_RISK_CTF_EXCHANGE);

  console.log('─── USDC.e (Collateral) ───');
  const balanceUsdc = parseFloat(ethers.utils.formatUnits(balance, 6));
  console.log('Balance:              ' + balanceUsdc.toFixed(6) + ' USDC');
  console.log('CTF Exchange Allow:   ' + (ctfUsdcAllowance.gte(ethers.constants.MaxUint256.div(2)) ? 'Unlimited ✅' : ethers.utils.formatUnits(ctfUsdcAllowance, 6) + ' USDC'));
  console.log('Neg Risk CTF Allow:   ' + (negRiskUsdcAllowance.gte(ethers.constants.MaxUint256.div(2)) ? 'Unlimited ✅' : ethers.utils.formatUnits(negRiskUsdcAllowance, 6) + ' USDC'));
  console.log('');

  // Check CTF Token (ERC1155) approvals - THIS IS THE KEY!
  const ctfToken = new ethers.Contract(CTF_TOKEN, ERC1155_ABI, provider);
  const ctfApproved = await ctfToken.isApprovedForAll(address, CTF_EXCHANGE);
  const negRiskApproved = await ctfToken.isApprovedForAll(address, NEG_RISK_CTF_EXCHANGE);

  console.log('─── CTF Tokens (ERC1155 Position Tokens) ───');
  console.log('CTF Exchange:         ' + (ctfApproved ? '✅ Approved' : '❌ NOT APPROVED'));
  console.log('Neg Risk CTF:         ' + (negRiskApproved ? '✅ Approved' : '❌ NOT APPROVED'));
  console.log('');

  const needsApproval = !ctfApproved || !negRiskApproved ||
    ctfUsdcAllowance.lt(ethers.constants.MaxUint256.div(2)) ||
    negRiskUsdcAllowance.lt(ethers.constants.MaxUint256.div(2));

  if (needsApproval) {
    console.log('⚠️  Missing approvals detected!');
    console.log('   Orders will fail with "not enough balance / allowance"');
    console.log('');
  }

  if (command === 'approve') {
    console.log('─── Approving All Required Contracts ───');
    console.log('');

    const usdcWithSigner = usdc.connect(wallet);
    const ctfTokenWithSigner = ctfToken.connect(wallet);

    // Get current gas price and add buffer
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice?.mul(2) || ethers.utils.parseUnits('50', 'gwei');
    console.log('Gas Price:', ethers.utils.formatUnits(gasPrice, 'gwei'), 'gwei');
    console.log('');

    // 1. Approve USDC.e for CTF Exchange
    if (ctfUsdcAllowance.lt(ethers.constants.MaxUint256.div(2))) {
      console.log('1. Approving USDC.e for CTF Exchange...');
      const tx1 = await usdcWithSigner.approve(CTF_EXCHANGE, ethers.constants.MaxUint256, { gasPrice });
      console.log('   TX:', tx1.hash);
      await tx1.wait();
      console.log('   ✅ Confirmed');
    } else {
      console.log('1. USDC.e CTF Exchange: Already approved ✓');
    }

    // 2. Approve USDC.e for Neg Risk CTF Exchange
    if (negRiskUsdcAllowance.lt(ethers.constants.MaxUint256.div(2))) {
      console.log('2. Approving USDC.e for Neg Risk CTF Exchange...');
      const tx2 = await usdcWithSigner.approve(NEG_RISK_CTF_EXCHANGE, ethers.constants.MaxUint256, { gasPrice });
      console.log('   TX:', tx2.hash);
      await tx2.wait();
      console.log('   ✅ Confirmed');
    } else {
      console.log('2. USDC.e Neg Risk CTF: Already approved ✓');
    }

    // 3. Approve CTF Tokens for CTF Exchange
    if (!ctfApproved) {
      console.log('3. Approving CTF Tokens for CTF Exchange...');
      const tx3 = await ctfTokenWithSigner.setApprovalForAll(CTF_EXCHANGE, true, { gasPrice });
      console.log('   TX:', tx3.hash);
      await tx3.wait();
      console.log('   ✅ Confirmed');
    } else {
      console.log('3. CTF Tokens CTF Exchange: Already approved ✓');
    }

    // 4. Approve CTF Tokens for Neg Risk CTF Exchange
    if (!negRiskApproved) {
      console.log('4. Approving CTF Tokens for Neg Risk CTF Exchange...');
      const tx4 = await ctfTokenWithSigner.setApprovalForAll(NEG_RISK_CTF_EXCHANGE, true, { gasPrice });
      console.log('   TX:', tx4.hash);
      await tx4.wait();
      console.log('   ✅ Confirmed');
    } else {
      console.log('4. CTF Tokens Neg Risk CTF: Already approved ✓');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ All approvals complete! You can now trade on Polymarket.');
    console.log('═══════════════════════════════════════════════════════════════');

  } else {
    console.log('─── Commands ───');
    console.log('  check   - Check current approvals (default)');
    console.log('  approve - Approve all contracts for trading');
    console.log('');
    console.log('Example: POLY_PRIVKEY=0x... npx tsx scripts/check-ctf-approval.ts approve');
  }
}

main().catch(console.error);

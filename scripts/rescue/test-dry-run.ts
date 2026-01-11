/**
 * Dry-run 测试 - 验证预签名逻辑（不广播）
 */

import { ethers, BigNumber } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://polygon-rpc.com';
const CHAIN_ID = 137;
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const SAFE_ADDRESS = process.env.SAFE_ADDRESS || '';
const GAS_PRICE = ethers.utils.parseUnits('500', 'gwei');  // 10x normal

const TOKENS = [
  { name: 'ETH 5:15-5:30AM Up', tokenId: '82875848930625660471708909808276475886706130514035184576915498263533434905065' },
  { name: 'ETH 2:30-2:45AM Down', tokenId: '56703946678402567398779119914656838730380226286022317686810135985797791941257' },
  { name: 'ETH 2:45-3:00AM Down', tokenId: '113451188975905701019909275656369706409918614011470440344205049432343218879759' },
  { name: 'ETH 5:30-5:45AM Up', tokenId: '36347416490015870327323843024035278361798601777731930769427053154643858785238' },
];

const ERC1155_ABI = [
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data) external',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
];

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

async function main() {
  console.log('='.repeat(60));
  console.log('Dry-Run 测试 - 验证预签名逻辑');
  console.log('='.repeat(60));

  const compromisedKey = process.env.COMPROMISED_KEY;
  const safeKey = process.env.SAFE_KEY;

  if (!compromisedKey || !safeKey || !SAFE_ADDRESS) {
    console.error('请设置环境变量:');
    console.error('  COMPROMISED_KEY=0x... SAFE_KEY=0x... SAFE_ADDRESS=0x... npx tsx ...');
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const compromisedWallet = new ethers.Wallet(compromisedKey, provider);
  const safeWallet = new ethers.Wallet(safeKey, provider);

  console.log(`\n被盗钱包: ${compromisedWallet.address}`);
  console.log(`安全钱包: ${safeWallet.address}`);

  // 显示钱包地址（移除硬编码验证）
  console.log('✅ 钱包已加载');

  // 获取 token 余额
  const ctfContract = new ethers.Contract(CTF_CONTRACT, ERC1155_ABI, provider);
  const tokenBalances: BigNumber[] = [];

  console.log('\n当前 Token 余额:');
  for (const token of TOKENS) {
    const balance = await ctfContract.balanceOf(compromisedWallet.address, token.tokenId);
    tokenBalances.push(balance);
    console.log(`  ${token.name}: ${ethers.utils.formatUnits(balance, 6)} 份`);
  }

  // 获取 USDC.e 余额
  const usdcContract = new ethers.Contract(USDC_E_CONTRACT, ERC20_ABI, provider);
  const usdcBalance = await usdcContract.balanceOf(compromisedWallet.address);
  console.log(`  USDC.e: $${ethers.utils.formatUnits(usdcBalance, 6)}`);

  // 获取当前 nonce
  const currentNonce = await provider.getTransactionCount(compromisedWallet.address);
  console.log(`\n当前 nonce: ${currentNonce}`);

  // 测试预签名
  console.log('\n' + '='.repeat(60));
  console.log('测试预签名...');
  console.log('='.repeat(60));

  const ctfInterface = new ethers.utils.Interface(ERC1155_ABI);
  const tokenIds = TOKENS.map(t => t.tokenId);

  // 1. ERC-1155 批量转账
  const batchTransferData = ctfInterface.encodeFunctionData('safeBatchTransferFrom', [
    compromisedWallet.address,
    SAFE_ADDRESS,
    tokenIds,
    tokenBalances,
    '0x',
  ]);

  const batchTransferTx = {
    to: CTF_CONTRACT,
    data: batchTransferData,
    nonce: currentNonce,
    gasLimit: 200000,
    maxPriorityFeePerGas: GAS_PRICE,
    maxFeePerGas: GAS_PRICE,
    chainId: CHAIN_ID,
    type: 2,
  };

  try {
    const signedBatchTransfer = await compromisedWallet.signTransaction(batchTransferTx);
    console.log(`\n✅ TX${currentNonce} - ERC-1155 批量转账签名成功`);
    console.log(`   长度: ${signedBatchTransfer.length} 字符`);
    console.log(`   前缀: ${signedBatchTransfer.slice(0, 20)}...`);

    // 解析签名的交易以验证
    const parsed = ethers.utils.parseTransaction(signedBatchTransfer);
    console.log(`   To: ${parsed.to}`);
    console.log(`   Nonce: ${parsed.nonce}`);
    console.log(`   Gas Limit: ${parsed.gasLimit?.toString()}`);
  } catch (e) {
    console.error(`\n❌ 签名失败: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  // 2. USDC.e 转账
  if (usdcBalance.gt(0)) {
    const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
    const transferData = erc20Interface.encodeFunctionData('transfer', [
      SAFE_ADDRESS,
      usdcBalance,
    ]);

    const transferTx = {
      to: USDC_E_CONTRACT,
      data: transferData,
      nonce: currentNonce + 1,
      gasLimit: 100000,
      maxPriorityFeePerGas: GAS_PRICE,
      maxFeePerGas: GAS_PRICE,
      chainId: CHAIN_ID,
      type: 2,
    };

    try {
      const signedTransfer = await compromisedWallet.signTransaction(transferTx);
      console.log(`\n✅ TX${currentNonce + 1} - USDC.e 转账签名成功`);
      console.log(`   金额: $${ethers.utils.formatUnits(usdcBalance, 6)}`);
    } catch (e) {
      console.error(`\n❌ USDC.e 转账签名失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 3. 计算 Gas 需求
  const totalGas = 200000 + 100000 + 21000;
  const estimatedMatic = BigNumber.from(totalGas).mul(GAS_PRICE);
  const maticToSend = estimatedMatic.mul(120).div(100);  // +20%

  console.log('\n' + '='.repeat(60));
  console.log('Gas 估算:');
  console.log('='.repeat(60));
  console.log(`  ERC-1155 批量转账: 200,000 gas`);
  console.log(`  USDC.e 转账: 100,000 gas`);
  console.log(`  MATIC 转账: 21,000 gas`);
  console.log(`  总计: ${totalGas.toLocaleString()} gas`);
  console.log(`\n  Gas Price: 500 gwei (10x normal)`);
  console.log(`  预估费用: ${ethers.utils.formatEther(estimatedMatic)} MATIC`);
  console.log(`  需发送 (含余量): ${ethers.utils.formatEther(maticToSend)} MATIC`);

  // 检查安全钱包余额
  const safeBalance = await provider.getBalance(safeWallet.address);
  console.log(`\n  安全钱包余额: ${ethers.utils.formatEther(safeBalance)} MATIC`);
  if (safeBalance.gte(maticToSend)) {
    console.log(`  ✅ 余额充足`);
  } else {
    console.log(`  ❌ 余额不足! 需要 ${ethers.utils.formatEther(maticToSend)} MATIC`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Dry-Run 测试完成!');
  console.log('='.repeat(60));
  console.log(`
准备就绪! 执行真实救援命令:

COMPROMISED_KEY=${compromisedKey.slice(0, 10)}... SAFE_KEY=${safeKey.slice(0, 10)}... \\
  npx tsx scripts/rescue/rescue-erc1155.ts
  `);
}

main().catch(console.error);

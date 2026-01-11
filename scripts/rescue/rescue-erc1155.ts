/**
 * Rescue ERC-1155 - 救援被盗钱包的 Conditional Tokens
 *
 * 原理：
 * 1. 预签名所有转账交易（ERC-1155 + USDC.e + MATIC）
 * 2. 部署 selfdestruct 合约，通过内部交易发送 MATIC（sweeper 看不到）
 * 3. 立即广播预签名的交易
 */

import { ethers, BigNumber } from 'ethers';

// ============================================
// 配置
// ============================================

const RPC_URL = process.env.RPC_URL || 'https://polygon-rpc.com';
const CHAIN_ID = 137;

const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const SAFE_ADDRESS = process.env.SAFE_ADDRESS || '';

// Gas 倍数 - 相对于网络当前 gas price
const GAS_MULTIPLIER = 3;

const TOKENS = [
  { name: 'ETH 5:15-5:30AM Up', tokenId: '82875848930625660471708909808276475886706130514035184576915498263533434905065' },
  { name: 'ETH 2:30-2:45AM Down', tokenId: '56703946678402567398779119914656838730380226286022317686810135985797791941257' },
  { name: 'ETH 2:45-3:00AM Down', tokenId: '113451188975905701019909275656369706409918614011470440344205049432343218879759' },
  { name: 'ETH 5:30-5:45AM Up', tokenId: '36347416490015870327323843024035278361798601777731930769427053154643858785238' },
];

/**
 * 生成 selfdestruct 合约 bytecode
 *
 * 原理：PUSH20 <address> + SELFDESTRUCT
 * - 0x73 = PUSH20 (将后面 20 字节压栈)
 * - <20 bytes> = 目标地址
 * - 0xff = SELFDESTRUCT (将合约余额发送到栈顶地址)
 *
 * 合约部署时立即执行 selfdestruct，将携带的 MATIC 发送给目标地址
 * 这是内部交易，不会出现在 mempool 中，sweeper 无法检测
 */
function buildSelfdestructBytecode(targetAddress: string): string {
  const addr = targetAddress.toLowerCase().replace('0x', '');
  if (addr.length !== 40) {
    throw new Error(`Invalid address length: ${addr.length}`);
  }
  // PUSH20 <address> SELFDESTRUCT
  return '0x73' + addr + 'ff';
}

const ERC1155_ABI = [
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data) external',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
];

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('='.repeat(60));
  console.log('被盗钱包救援脚本 - ERC-1155 批量转账');
  console.log('='.repeat(60));

  const compromisedKey = process.env.COMPROMISED_KEY;
  const safeKey = process.env.SAFE_KEY;

  if (!compromisedKey || !safeKey || !SAFE_ADDRESS) {
    console.error('\n请设置环境变量:');
    console.error('COMPROMISED_KEY=0x... SAFE_KEY=0x... SAFE_ADDRESS=0x... npx tsx scripts/rescue/rescue-erc1155.ts');
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const compromisedWallet = new ethers.Wallet(compromisedKey, provider);
  const safeWallet = new ethers.Wallet(safeKey, provider);

  console.log(`\n被盗钱包: ${compromisedWallet.address}`);
  console.log(`安全钱包: ${safeWallet.address}`);
  console.log(`目标地址: ${SAFE_ADDRESS}`);

  // 获取实时 gas price
  const networkGasPrice = await provider.getGasPrice();
  const gasPrice = networkGasPrice.mul(GAS_MULTIPLIER);
  console.log(`\n网络 Gas Price: ${ethers.utils.formatUnits(networkGasPrice, 'gwei')} gwei`);
  console.log(`使用 Gas Price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei (${GAS_MULTIPLIER}x)`);

  // 获取 token 余额
  const ctfContract = new ethers.Contract(CTF_CONTRACT, ERC1155_ABI, provider);
  const tokenBalances: BigNumber[] = [];

  console.log('\nToken 余额:');
  for (const token of TOKENS) {
    const balance = await ctfContract.balanceOf(compromisedWallet.address, token.tokenId);
    tokenBalances.push(balance);
    console.log(`  ${token.name}: ${ethers.utils.formatUnits(balance, 6)}`);
  }

  // USDC.e 余额
  const usdcContract = new ethers.Contract(USDC_E_CONTRACT, ERC20_ABI, provider);
  const usdcBalance = await usdcContract.balanceOf(compromisedWallet.address);
  console.log(`  USDC.e: $${ethers.utils.formatUnits(usdcBalance, 6)}`);

  const currentNonce = await provider.getTransactionCount(compromisedWallet.address);
  console.log(`\n当前 nonce: ${currentNonce}`);

  // ============================================
  // Phase 1: 预签名所有交易
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('Phase 1: 预签名所有交易');
  console.log('='.repeat(60));

  const signedTxs: string[] = [];
  let nonce = currentNonce;

  // 1. ERC-1155 批量转账
  const ctfInterface = new ethers.utils.Interface(ERC1155_ABI);
  const batchTransferData = ctfInterface.encodeFunctionData('safeBatchTransferFrom', [
    compromisedWallet.address, SAFE_ADDRESS, TOKENS.map(t => t.tokenId), tokenBalances, '0x'
  ]);

  const signedBatch = await compromisedWallet.signTransaction({
    to: CTF_CONTRACT, data: batchTransferData, nonce: nonce++,
    gasLimit: 200000, maxPriorityFeePerGas: gasPrice, maxFeePerGas: gasPrice, chainId: CHAIN_ID, type: 2
  });
  signedTxs.push(signedBatch);
  console.log(`\n✓ TX${nonce - 1}: ERC-1155 批量转账已签名 (${TOKENS.length} tokens)`);

  // 2. USDC.e 转账
  if (usdcBalance.gt(0)) {
    const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
    const transferData = erc20Interface.encodeFunctionData('transfer', [SAFE_ADDRESS, usdcBalance]);

    const signedUsdc = await compromisedWallet.signTransaction({
      to: USDC_E_CONTRACT, data: transferData, nonce: nonce++,
      gasLimit: 100000, maxPriorityFeePerGas: gasPrice, maxFeePerGas: gasPrice, chainId: CHAIN_ID, type: 2
    });
    signedTxs.push(signedUsdc);
    console.log(`✓ TX${nonce - 1}: USDC.e 转账已签名 ($${ethers.utils.formatUnits(usdcBalance, 6)})`);
  }

  // 3. MATIC 转账 (剩余)
  const signedMatic = await compromisedWallet.signTransaction({
    to: SAFE_ADDRESS, value: ethers.utils.parseEther('0.001'), nonce: nonce++,
    gasLimit: 21000, maxPriorityFeePerGas: gasPrice, maxFeePerGas: gasPrice, chainId: CHAIN_ID, type: 2
  });
  signedTxs.push(signedMatic);
  console.log(`✓ TX${nonce - 1}: MATIC 转账已签名`);

  // ============================================
  // Phase 2: 部署 Rescue 合约 (selfdestruct 发送 MATIC)
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('Phase 2: 部署 Rescue 合约 (selfdestruct)');
  console.log('='.repeat(60));

  // 计算需要的 MATIC (gas 费用 + 20% 余量)
  const totalGas = 200000 + 100000 + 21000;  // ERC-1155 + USDC.e + MATIC
  const maticToSend = BigNumber.from(totalGas).mul(gasPrice).mul(120).div(100);

  console.log(`\n总计 ${signedTxs.length} 笔预签名交易`);
  console.log(`预估 gas 用量: ${totalGas.toLocaleString()}`);
  console.log(`发送 ${ethers.utils.formatEther(maticToSend)} MATIC via selfdestruct...`);

  // 生成 selfdestruct bytecode (PUSH20 <address> SELFDESTRUCT)
  const rescueBytecode = buildSelfdestructBytecode(compromisedWallet.address);
  console.log(`\nRescue bytecode: ${rescueBytecode}`);
  console.log(`Bytecode 长度: ${(rescueBytecode.length - 2) / 2} bytes`);

  // 部署合约 (合约立即 selfdestruct，发送 MATIC 给被盗钱包)
  // 使用动态 gas price（与预签名交易相同）
  const deployTx = await safeWallet.sendTransaction({
    data: rescueBytecode,
    value: maticToSend,
    gasLimit: 70000,  // 部署+selfdestruct 需要约 53k gas
    maxPriorityFeePerGas: gasPrice,
    maxFeePerGas: gasPrice,
  });

  console.log(`\nRescue TX: ${deployTx.hash}`);
  console.log('等待确认...');
  await deployTx.wait(1);
  console.log('✓ Rescue 合约已部署，MATIC 已发送到被盗钱包');

  // ============================================
  // Phase 3: 广播预签名交易
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('Phase 3: 广播预签名交易');
  console.log('='.repeat(60));

  const txNames = ['ERC-1155 批量转账', 'USDC.e 转账', 'MATIC 转出'];
  let successCount = 0;

  for (let i = 0; i < signedTxs.length; i++) {
    try {
      console.log(`\n发送 TX${i + 1} (${txNames[i]})...`);
      const tx = await provider.sendTransaction(signedTxs[i]);
      console.log(`TX: ${tx.hash}`);
      console.log('等待确认...');
      await tx.wait(1);
      console.log(`✓ TX${i + 1} 确认`);
      successCount++;
    } catch (e) {
      console.error(`✗ TX${i + 1} 失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ============================================
  // 完成
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log(`救援完成! ${successCount}/${signedTxs.length} 交易成功`);
  console.log('='.repeat(60));

  console.log('\n目标地址最终余额:');
  for (const token of TOKENS) {
    const balance = await ctfContract.balanceOf(SAFE_ADDRESS, token.tokenId);
    console.log(`  ${token.name}: ${ethers.utils.formatUnits(balance, 6)}`);
  }
  const finalUsdc = await usdcContract.balanceOf(SAFE_ADDRESS);
  console.log(`  USDC.e: $${ethers.utils.formatUnits(finalUsdc, 6)}`);

  const finalMatic = await provider.getBalance(SAFE_ADDRESS);
  console.log(`  MATIC: ${ethers.utils.formatEther(finalMatic)}`);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });

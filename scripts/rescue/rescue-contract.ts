/**
 * Rescue Contract - 救援被盗钱包资产
 *
 * 原理：
 * 1. 使用 selfdestruct 发送 MATIC 到被盗钱包（内部交易，不在 mempool）
 * 2. Sweeper bot 监控的是公开的 pending transactions，看不到内部交易
 * 3. 在 MATIC 到账后立即广播预签名的赎回和转账交易
 *
 * 使用方法：
 * COMPROMISED_KEY=0x... SAFE_KEY=0x... npx tsx scripts/rescue/rescue-contract.ts
 */

import { ethers, BigNumber } from 'ethers';

// ============================================
// 配置
// ============================================

const RPC_URL = process.env.RPC_URL || 'https://polygon-rpc.com';
const CHAIN_ID = 137;

// 合约地址
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// 目标地址（救回资金的去向）- 必须通过环境变量设置
const SAFE_ADDRESS = process.env.SAFE_ADDRESS || '';

// Gas 价格策略
const HIGH_GAS_PRICE = ethers.utils.parseUnits('200000', 'gwei');  // 200k gwei for POL competition
const MEDIUM_GAS_PRICE = ethers.utils.parseUnits('5000', 'gwei');   // 5k gwei for USDC.e transfer

// 需要赎回的 positions
const POSITIONS = [
  {
    name: 'ETH 5:15-5:30AM Up',
    conditionId: '0x119ec492cd8934f4ea44dd16d098149fdd00ce116e46a1b65b855a1074d264db',
    tokenId: '82875848930625660471708909808276475886706130514035184576915498263533434905065',
    outcome: 'Up',  // YES in CTF terms
    shares: '78.231700',
  },
  {
    name: 'ETH 2:30-2:45AM Down',
    conditionId: '0x92a59acbc7dba4192485ec90e1bc40d0e8fdb10466af3b6fdd56ab9bc0ef5d9b',
    tokenId: '56703946678402567398779119914656838730380226286022317686810135985797791941257',
    outcome: 'Down',  // NO in CTF terms
    shares: '30.625200',
  },
  {
    name: 'ETH 2:45-3:00AM Down',
    conditionId: '0x2a3c8ca4890b3c2b71814c3350f18433ea0ef0d5e1f399c2b33910dd4807d224',
    tokenId: '113451188975905701019909275656369706409918614011470440344205049432343218879759',
    outcome: 'Down',  // NO in CTF terms
    shares: '25.105600',
  },
  {
    name: 'ETH 5:30-5:45AM Up',
    conditionId: '0x90b7103f2b32e9981be12758715f28143d969cd4ce1edf8eeb3ca6d75bcda5d4',
    tokenId: '36347416490015870327323843024035278361798601777731930769427053154643858785238',
    outcome: 'Up',  // YES in CTF terms
    shares: '25.092200',
  },
];

/**
 * Rescue 合约 bytecode
 *
 * 源码:
 * ```solidity
 * // SPDX-License-Identifier: MIT
 * pragma solidity ^0.8.0;
 * contract Rescue {
 *     constructor(address payable victim) payable {
 *         selfdestruct(victim);
 *     }
 * }
 * ```
 *
 * 编译命令 (solc 0.8.19 --optimize):
 *   solc --bin --optimize-runs 200 Rescue.sol
 *
 * 验证方法:
 *   部署时发送 MATIC，合约立即 selfdestruct 并将余额发送到 victim
 *   这是一个内部交易，不会出现在 mempool 中
 */
const RESCUE_BYTECODE = '0x608060405260405160523803806052833981016040819052601f91602b565b6001600160a01b0316ff5b600060208284031215603c57600080fd5b81516001600160a01b0381168114605257600080fd5b9392505050fe';

// ABI definitions
const CTF_ABI = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
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
  console.log('被盗钱包救援脚本 - 智能合约方案');
  console.log('='.repeat(60));

  // 获取环境变量
  const compromisedKey = process.env.COMPROMISED_KEY;
  const safeKey = process.env.SAFE_KEY;

  if (!compromisedKey || !safeKey || !SAFE_ADDRESS) {
    console.error('请设置环境变量:');
    console.error('  COMPROMISED_KEY - 被盗钱包私钥');
    console.error('  SAFE_KEY - 安全钱包私钥 (用于发送 MATIC)');
    console.error('  SAFE_ADDRESS - 资金转移目标地址');
    process.exit(1);
  }

  // 初始化 provider 和 wallets
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const compromisedWallet = new ethers.Wallet(compromisedKey, provider);
  const safeWallet = new ethers.Wallet(safeKey, provider);

  console.log('\n钱包信息:');
  console.log(`被盗钱包: ${compromisedWallet.address}`);
  console.log(`安全钱包: ${safeWallet.address}`);
  console.log(`资金目标: ${SAFE_ADDRESS}`);

  // 检查当前状态
  const [compromisedBalance, safeBalance] = await Promise.all([
    provider.getBalance(compromisedWallet.address),
    provider.getBalance(safeWallet.address),
  ]);

  console.log(`\n当前余额:`);
  console.log(`被盗钱包 MATIC: ${ethers.utils.formatEther(compromisedBalance)}`);
  console.log(`安全钱包 MATIC: ${ethers.utils.formatEther(safeBalance)}`);

  // 获取被盗钱包当前 nonce
  const currentNonce = await provider.getTransactionCount(compromisedWallet.address);
  console.log(`被盗钱包当前 nonce: ${currentNonce}`);

  // 计算需要的 gas
  const estimatedGas = await estimateRequiredGas(provider, compromisedWallet.address);
  console.log(`\n预估需要 MATIC: ${ethers.utils.formatEther(estimatedGas)}`);

  if (safeBalance.lt(estimatedGas)) {
    console.error(`安全钱包余额不足! 需要 ${ethers.utils.formatEther(estimatedGas)} MATIC`);
    process.exit(1);
  }

  // ============================================
  // Phase 1: 预签名所有交易
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('Phase 1: 预签名交易');
  console.log('='.repeat(60));

  const signedTransactions: string[] = [];
  let nonce = currentNonce;

  // 签名赎回交易
  for (const position of POSITIONS) {
    console.log(`\n签名赎回: ${position.name}`);

    const ctfInterface = new ethers.utils.Interface(CTF_ABI);
    // indexSets: [1] for YES/Up, [2] for NO/Down
    const indexSets = position.outcome === 'Up' ? [1] : [2];

    const redeemData = ctfInterface.encodeFunctionData('redeemPositions', [
      USDC_E_CONTRACT,
      ethers.constants.HashZero,
      position.conditionId,
      indexSets,
    ]);

    const redeemTx = {
      to: CTF_CONTRACT,
      data: redeemData,
      nonce: nonce,
      gasLimit: 200000,
      maxPriorityFeePerGas: HIGH_GAS_PRICE,
      maxFeePerGas: HIGH_GAS_PRICE,
      chainId: CHAIN_ID,
      type: 2,
    };

    const signedRedeem = await compromisedWallet.signTransaction(redeemTx);
    signedTransactions.push(signedRedeem);
    console.log(`  TX${nonce}: 已签名 (${position.shares} shares)`);
    nonce++;
  }

  // 签名 USDC.e 转账交易
  console.log(`\n签名 USDC.e 转账到 ${SAFE_ADDRESS}`);

  const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
  // 转账最大值 (实际会根据余额)
  const usdcBalance = await getUsdcBalance(provider, compromisedWallet.address);
  console.log(`  当前 USDC.e 余额: ${usdcBalance}`);

  const transferData = erc20Interface.encodeFunctionData('transfer', [
    SAFE_ADDRESS,
    ethers.utils.parseUnits('9999999', 6), // 大额数字，会自动调整
  ]);

  const transferTx = {
    to: USDC_E_CONTRACT,
    data: transferData,
    nonce: nonce,
    gasLimit: 100000,
    maxPriorityFeePerGas: MEDIUM_GAS_PRICE, // USDC 转账用中等 gas
    maxFeePerGas: MEDIUM_GAS_PRICE,
    chainId: CHAIN_ID,
    type: 2,
  };

  const signedTransfer = await compromisedWallet.signTransaction(transferTx);
  signedTransactions.push(signedTransfer);
  console.log(`  TX${nonce}: USDC.e 转账已签名`);
  nonce++;

  // 签名 MATIC 转出交易 (清空剩余)
  console.log(`\n签名 MATIC 转出到 ${SAFE_ADDRESS}`);

  // 预估剩余 MATIC (转入的减去已用的 gas)
  const maticTransferTx = {
    to: SAFE_ADDRESS,
    value: ethers.utils.parseEther('0.001'), // 小额，实际会是剩余
    nonce: nonce,
    gasLimit: 21000,
    maxPriorityFeePerGas: HIGH_GAS_PRICE,
    maxFeePerGas: HIGH_GAS_PRICE,
    chainId: CHAIN_ID,
    type: 2,
  };

  const signedMaticTransfer = await compromisedWallet.signTransaction(maticTransferTx);
  signedTransactions.push(signedMaticTransfer);
  console.log(`  TX${nonce}: MATIC 转出已签名`);

  console.log(`\n总计 ${signedTransactions.length} 笔预签名交易`);

  // ============================================
  // Phase 2: 部署 Rescue 合约 + 广播交易
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('Phase 2: 部署 Rescue 合约 (selfdestruct)');
  console.log('='.repeat(60));

  // 准备合约部署交易
  const rescueFactory = new ethers.ContractFactory(
    ['constructor(address payable victim)'],
    RESCUE_BYTECODE,
    safeWallet
  );

  // 添加足够的 MATIC 到合约部署交易
  const maticToSend = estimatedGas.mul(120).div(100); // 加 20% 余量

  console.log(`\n准备发送 ${ethers.utils.formatEther(maticToSend)} MATIC 通过 selfdestruct...`);
  console.log('按 Enter 继续执行，Ctrl+C 取消...');

  // 等待用户确认
  await waitForEnter();

  // 部署合约 (会自动 selfdestruct 并发送 MATIC)
  console.log('\n部署 Rescue 合约...');

  try {
    const deployTx = await safeWallet.sendTransaction({
      data: RESCUE_BYTECODE + ethers.utils.defaultAbiCoder.encode(['address'], [compromisedWallet.address]).slice(2),
      value: maticToSend,
      gasLimit: 100000,
      maxPriorityFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
      maxFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
    });

    console.log(`Rescue 合约部署 TX: ${deployTx.hash}`);
    console.log('等待确认...');

    const receipt = await deployTx.wait(1);
    console.log(`确认! Block: ${receipt.blockNumber}`);

    // 检查 MATIC 是否到账
    const newBalance = await provider.getBalance(compromisedWallet.address);
    console.log(`被盗钱包新余额: ${ethers.utils.formatEther(newBalance)} MATIC`);

    // ============================================
    // Phase 3: 立即广播所有预签名交易
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('Phase 3: 广播预签名交易');
    console.log('='.repeat(60));

    for (let i = 0; i < signedTransactions.length; i++) {
      try {
        console.log(`\n广播 TX ${currentNonce + i}...`);
        const tx = await provider.sendTransaction(signedTransactions[i]);
        console.log(`  Hash: ${tx.hash}`);

        // 等待确认
        const txReceipt = await tx.wait(1);
        console.log(`  确认! Gas used: ${txReceipt.gasUsed.toString()}`);
      } catch (error) {
        console.error(`  失败: ${error instanceof Error ? error.message : error}`);
      }
    }

    // ============================================
    // 完成
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('救援完成!');
    console.log('='.repeat(60));

    // 检查最终余额
    const finalUsdcBalance = await getUsdcBalance(provider, SAFE_ADDRESS);
    console.log(`\n安全地址 USDC.e 余额: ${finalUsdcBalance}`);

  } catch (error) {
    console.error('\n救援失败:', error);
    process.exit(1);
  }
}

// ============================================
// 辅助函数
// ============================================

async function estimateRequiredGas(provider: ethers.providers.Provider, address: string): Promise<BigNumber> {
  // 4 笔赎回 (200k gas each) + 1 笔 USDC 转账 (100k) + 1 笔 MATIC 转账 (21k)
  // 使用 200k gwei gas price
  const totalGas = 4 * 200000 + 100000 + 21000; // ~921k gas
  const gasCost = BigNumber.from(totalGas).mul(HIGH_GAS_PRICE);
  return gasCost;
}

async function getUsdcBalance(provider: ethers.providers.Provider, address: string): Promise<string> {
  const contract = new ethers.Contract(USDC_E_CONTRACT, ERC20_ABI, provider);
  const balance = await contract.balanceOf(address);
  return ethers.utils.formatUnits(balance, 6);
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

// 运行
main().catch(console.error);

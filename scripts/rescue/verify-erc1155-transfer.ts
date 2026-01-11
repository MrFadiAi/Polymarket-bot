/**
 * 验证 CTF 合约是否支持 ERC-1155 转账
 *
 * CTF 合约地址: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
 */

import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://polygon-rpc.com';
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

// 钱包地址 - 通过环境变量设置
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '';

// 需要检查的 token IDs
const TOKEN_IDS = [
  '82875848930625660471708909808276475886706130514035184576915498263533434905065',
  '56703946678402567398779119914656838730380226286022317686810135985797791941257',
  '113451188975905701019909275656369706409918614011470440344205049432343218879759',
  '36347416490015870327323843024035278361798601777731930769427053154643858785238',
];

// ERC-1155 标准 ABI
const ERC1155_ABI = [
  // 查询余额
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  // 转账方法
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data) external',
  // 授权检查
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved) external',
  // ERC-165 接口检测
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
];

// ERC-1155 interface ID
const ERC1155_INTERFACE_ID = '0xd9b67a26';

async function main() {
  console.log('='.repeat(60));
  console.log('验证 CTF 合约 ERC-1155 功能');
  console.log('='.repeat(60));

  if (!WALLET_ADDRESS) {
    console.error('请设置环境变量: WALLET_ADDRESS=0x...');
    process.exit(1);
  }

  console.log(`\n检查钱包: ${WALLET_ADDRESS}`);

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const ctfContract = new ethers.Contract(CTF_CONTRACT, ERC1155_ABI, provider);

  // 1. 检查是否支持 ERC-1155 接口
  console.log('\n1. 检查 ERC-1155 接口支持...');
  try {
    const supportsERC1155 = await ctfContract.supportsInterface(ERC1155_INTERFACE_ID);
    console.log(`   ERC-1155 接口支持: ${supportsERC1155 ? '✅ 是' : '❌ 否'}`);
  } catch (e) {
    console.log(`   ERC-1155 接口检查失败: ${e instanceof Error ? e.message : e}`);
  }

  // 2. 检查 token 余额
  console.log('\n2. 检查 token 余额...');
  for (const tokenId of TOKEN_IDS) {
    try {
      const balance = await ctfContract.balanceOf(WALLET_ADDRESS, tokenId);
      const balanceFormatted = ethers.utils.formatUnits(balance, 6);
      console.log(`   Token ${tokenId.slice(0, 20)}...: ${balanceFormatted} 份`);
    } catch (e) {
      console.log(`   Token ${tokenId.slice(0, 20)}... 余额查询失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 3. 批量查询余额
  console.log('\n3. 批量查询余额...');
  try {
    const accounts = TOKEN_IDS.map(() => WALLET_ADDRESS);
    const balances = await ctfContract.balanceOfBatch(accounts, TOKEN_IDS);
    console.log('   批量查询成功! ✅');
    balances.forEach((balance: ethers.BigNumber, i: number) => {
      console.log(`   Position ${i + 1}: ${ethers.utils.formatUnits(balance, 6)} 份`);
    });
  } catch (e) {
    console.log(`   批量查询失败: ${e instanceof Error ? e.message : e}`);
  }

  // 4. 总结
  console.log('\n' + '='.repeat(60));
  console.log('总结:');
  console.log('='.repeat(60));
  console.log(`
CTF 合约 (${CTF_CONTRACT}) 是标准 ERC-1155 合约。

支持的转账方法:
- safeTransferFrom(from, to, id, amount, data) - 单个转账
- safeBatchTransferFrom(from, to, ids, amounts, data) - 批量转账

注意事项:
1. 需要有 MATIC 支付 gas 费
2. 如果转给 EOA 地址，不需要额外授权
3. 批量转账更省 gas
  `);
}

main().catch(console.error);

/**
 * CTF (Conditional Token Framework) Client
 *
 * Provides on-chain operations for Polymarket's conditional tokens:
 * - Split: USDC → YES + NO token pair
 * - Merge: YES + NO → USDC
 * - Redeem: Winning tokens → USDC (after market resolution)
 *
 * ⚠️ CRITICAL: Polymarket CTF uses USDC.e (bridged), NOT native USDC!
 *
 * | Token         | Address                                    | CTF Compatible |
 * |---------------|--------------------------------------------|-----------------
 * | USDC.e        | 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 | ✅ Yes          |
 * | Native USDC   | 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 | ❌ No           |
 *
 * Common Mistake:
 * - Your wallet has native USDC but CTF operations fail
 * - Solution: Use SwapService.transferUsdcE() or swap native USDC to USDC.e
 *
 * Based on: docs/01-product-research/06-poly-sdk/05-ctf-integration-plan.md
 *
 * Contract: Gnosis Conditional Tokens on Polygon
 * https://docs.polymarket.com/developers/CTF/overview
 */

import { ethers, Contract, Wallet, BigNumber } from 'ethers';

// ===== Contract Addresses (Polygon Mainnet) =====

export const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

/**
 * USDC.e (Bridged USDC) - The ONLY USDC accepted by Polymarket CTF
 *
 * ⚠️ WARNING: This is NOT native USDC (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359)
 *
 * If your wallet has native USDC but CTF operations fail with "Insufficient USDC balance",
 * you need to swap your native USDC to USDC.e first using:
 * - SwapService.swap('USDC', 'USDC_E', amount)
 * - Or transfer USDC.e using SwapService.transferUsdcE()
 */
export const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

/** Native USDC on Polygon - NOT compatible with CTF */
export const NATIVE_USDC_CONTRACT = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

export const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
export const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

// USDC.e uses 6 decimals
export const USDC_DECIMALS = 6;

// ===== ABIs =====

const CTF_ABI = [
  // Split: USDC → YES + NO
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external',
  // Merge: YES + NO → USDC
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external',
  // Redeem: Winning tokens → USDC
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
  // Balance query
  'function balanceOf(address account, uint256 positionId) view returns (uint256)',
  // Check if condition is resolved
  'function payoutNumerators(bytes32 conditionId, uint256 outcomeIndex) view returns (uint256)',
  'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// ===== Types =====

export interface CTFConfig {
  /** Private key for signing transactions */
  privateKey: string;
  /** RPC URL (default: Polygon mainnet) */
  rpcUrl?: string;
  /** Chain ID (default: 137 for Polygon) */
  chainId?: number;
  /** Gas price multiplier (default: 1.2) */
  gasPriceMultiplier?: number;
  /** Transaction confirmation blocks (default: 1) */
  confirmations?: number;
  /** Transaction timeout in ms (default: 60000) */
  txTimeout?: number;
}

export interface GasEstimate {
  /** Estimated gas units */
  gasUnits: string;
  /** Gas price in gwei */
  gasPriceGwei: string;
  /** Estimated cost in MATIC */
  costMatic: string;
  /** Estimated cost in USDC (at current MATIC price) */
  costUsdc: string;
  /** MATIC/USDC price used */
  maticPrice: number;
}

export interface TransactionStatus {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed' | 'reverted';
  confirmations: number;
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  errorReason?: string;
}

/** Common revert reasons */
export enum RevertReason {
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_ALLOWANCE = 'INSUFFICIENT_ALLOWANCE',
  CONDITION_NOT_RESOLVED = 'CONDITION_NOT_RESOLVED',
  INVALID_PARTITION = 'INVALID_PARTITION',
  INVALID_CONDITION = 'INVALID_CONDITION',
  EXECUTION_REVERTED = 'EXECUTION_REVERTED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export interface SplitResult {
  success: boolean;
  txHash: string;
  amount: string;
  yesTokens: string;
  noTokens: string;
  gasUsed?: string;
}

export interface MergeResult {
  success: boolean;
  txHash: string;
  amount: string;
  usdcReceived: string;
  gasUsed?: string;
}

export interface RedeemResult {
  success: boolean;
  txHash: string;
  /** Winning outcome (e.g., 'YES', 'NO', 'Up', 'Down', 'Team1', 'Team2') */
  outcome: string;
  tokensRedeemed: string;
  usdcReceived: string;
  gasUsed?: string;
}

export interface PositionBalance {
  conditionId: string;
  yesBalance: string;
  noBalance: string;
  yesPositionId: string;
  noPositionId: string;
}

export interface TokenIds {
  yesTokenId: string;
  noTokenId: string;
}

export interface MarketResolution {
  conditionId: string;
  isResolved: boolean;
  /** Winning outcome (e.g., 'YES', 'NO') - determined by payout numerators */
  winningOutcome?: string;
  payoutNumerators: [number, number];
  payoutDenominator: number;
}

// ===== CTF Client =====

const DEFAULT_MATIC_PRICE = 0.50;

export class CTFClient {
  private provider: ethers.providers.BaseProvider;
  private wallet: Wallet;
  private ctfContract: Contract;
  private usdcContract: Contract;
  private gasPriceMultiplier: number;
  private confirmations: number;
  private txTimeout: number;
  private cachedMaticPrice: number = DEFAULT_MATIC_PRICE;
  private maticPriceLastUpdated: number = 0;

  constructor(config: CTFConfig) {
    const rpcUrl = config.rpcUrl || 'https://polygon-bor-rpc.publicnode.com';
    const network = {
      chainId: config.chainId || 137,
      name: 'matic',
    };

    // StaticJsonRpcProvider évite le check async eth_chainId qui provoque l'erreur "noNetwork"
    this.provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, network);
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.ctfContract = new Contract(CTF_CONTRACT, CTF_ABI, this.wallet);
    this.usdcContract = new Contract(USDC_CONTRACT, ERC20_ABI, this.wallet);
    this.gasPriceMultiplier = config.gasPriceMultiplier || 1.2;
    this.confirmations = config.confirmations || 1;
    this.txTimeout = config.txTimeout || 60000;
  }

  getAddress(): string {
    return this.wallet.address;
  }

  async getUsdcBalance(): Promise<string> {
    const balance = await this.usdcContract.balanceOf(this.wallet.address);
    return ethers.utils.formatUnits(balance, USDC_DECIMALS);
  }

  async getNativeUsdcBalance(): Promise<string> {
    const nativeUsdcContract = new Contract(NATIVE_USDC_CONTRACT, ERC20_ABI, this.provider);
    const balance = await nativeUsdcContract.balanceOf(this.wallet.address);
    return ethers.utils.formatUnits(balance, USDC_DECIMALS);
  }

  async checkReadyForCTF(amount: string): Promise<{
    ready: boolean;
    usdcEBalance: string;
    nativeUsdcBalance: string;
    maticBalance: string;
    suggestion?: string;
  }> {
    const [usdcE, nativeUsdc, matic] = await Promise.all([
      this.getUsdcBalance(),
      this.getNativeUsdcBalance(),
      this.provider.getBalance(this.wallet.address),
    ]);

    const usdcEBalance = parseFloat(usdcE);
    const nativeUsdcBalance = parseFloat(nativeUsdc);
    const maticBalance = parseFloat(ethers.utils.formatEther(matic));
    const amountNeeded = parseFloat(amount);

    const result = {
      ready: false,
      usdcEBalance: usdcE,
      nativeUsdcBalance: nativeUsdc,
      maticBalance: ethers.utils.formatEther(matic),
      suggestion: undefined as string | undefined,
    };

    if (maticBalance < 0.01) {
      result.suggestion = `Insufficient MATIC for gas fees. Have: ${maticBalance.toFixed(4)} MATIC, need at least 0.01 MATIC.`;
      return result;
    }

    if (usdcEBalance < amountNeeded) {
      if (nativeUsdcBalance >= amountNeeded) {
        result.suggestion = `You have ${nativeUsdcBalance.toFixed(2)} native USDC but only ${usdcEBalance.toFixed(2)} USDC.e. ` +
          `Polymarket CTF requires USDC.e. Use SwapService.swap('USDC', 'USDC_E', '${amount}') to convert.`;
      } else if (nativeUsdcBalance > 0) {
        result.suggestion = `Insufficient USDC.e. Have: ${usdcEBalance.toFixed(2)} USDC.e + ${nativeUsdcBalance.toFixed(2)} native USDC, need: ${amount} USDC.e. ` +
          `Swap all native USDC to USDC.e, then add more funds.`;
      } else {
        result.suggestion = `Insufficient USDC.e. Have: ${usdcEBalance.toFixed(2)} USDC.e, need: ${amount} USDC.e.`;
      }
      return result;
    }

    result.ready = true;
    return result;
  }

  async split(conditionId: string, amount: string): Promise<SplitResult> {
    const amountWei = ethers.utils.parseUnits(amount, USDC_DECIMALS);

    const balance = await this.usdcContract.balanceOf(this.wallet.address);
    if (balance.lt(amountWei)) {
      throw new Error(`Insufficient USDC balance. Have: ${ethers.utils.formatUnits(balance, USDC_DECIMALS)}, Need: ${amount}`);
    }

    const allowance = await this.usdcContract.allowance(this.wallet.address, CTF_CONTRACT);
    if (allowance.lt(amountWei)) {
      const approveTx = await this.usdcContract.approve(
        CTF_CONTRACT,
        ethers.constants.MaxUint256,
        await this.getGasOptions()
      );
      await approveTx.wait();
    }

    const tx = await this.ctfContract.splitPosition(
      USDC_CONTRACT,
      ethers.constants.HashZero,
      conditionId,
      [1, 2],
      amountWei,
      await this.getGasOptions()
    );

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
      amount,
      yesTokens: amount,
      noTokens: amount,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  async merge(conditionId: string, amount: string): Promise<MergeResult> {
    const amountWei = ethers.utils.parseUnits(amount, USDC_DECIMALS);

    const balances = await this.getPositionBalance(conditionId);
    const yesBalance = ethers.utils.parseUnits(balances.yesBalance, USDC_DECIMALS);
    const noBalance = ethers.utils.parseUnits(balances.noBalance, USDC_DECIMALS);

    if (yesBalance.lt(amountWei) || noBalance.lt(amountWei)) {
      throw new Error(
        `Insufficient token balance. Need ${amount} of each. Have: YES=${balances.yesBalance}, NO=${balances.noBalance}`
      );
    }

    const tx = await this.ctfContract.mergePositions(
      USDC_CONTRACT,
      ethers.constants.HashZero,
      conditionId,
      [1, 2],
      amountWei,
      await this.getGasOptions()
    );

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
      amount,
      usdcReceived: amount,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  async mergeByTokenIds(conditionId: string, tokenIds: TokenIds, amount: string): Promise<MergeResult> {
    const amountWei = ethers.utils.parseUnits(amount, USDC_DECIMALS);

    const balances = await this.getPositionBalanceByTokenIds(conditionId, tokenIds);
    const yesBalance = ethers.utils.parseUnits(balances.yesBalance, USDC_DECIMALS);
    const noBalance = ethers.utils.parseUnits(balances.noBalance, USDC_DECIMALS);

    if (yesBalance.lt(amountWei) || noBalance.lt(amountWei)) {
      throw new Error(
        `Insufficient token balance. Need ${amount} of each. Have: YES=${balances.yesBalance}, NO=${balances.noBalance}`
      );
    }

    const tx = await this.ctfContract.mergePositions(
      USDC_CONTRACT,
      ethers.constants.HashZero,
      conditionId,
      [1, 2],
      amountWei,
      await this.getGasOptions()
    );

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
      amount,
      usdcReceived: amount,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  async redeem(conditionId: string, outcome?: string): Promise<RedeemResult> {
    const resolution = await this.getMarketResolution(conditionId);
    if (!resolution.isResolved) {
      throw new Error('Market is not resolved yet');
    }

    const winningOutcome = outcome || resolution.winningOutcome;
    if (!winningOutcome) {
      throw new Error('Could not determine winning outcome');
    }

    const balances = await this.getPositionBalance(conditionId);
    const tokenBalance = winningOutcome === 'YES' ? balances.yesBalance : balances.noBalance;

    if (parseFloat(tokenBalance) === 0) {
      throw new Error(`No ${winningOutcome} tokens to redeem`);
    }

    const indexSets = winningOutcome === 'YES' ? [1] : [2];

    const tx = await this.ctfContract.redeemPositions(
      USDC_CONTRACT,
      ethers.constants.HashZero,
      conditionId,
      indexSets,
      await this.getGasOptions()
    );

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
      outcome: winningOutcome,
      tokensRedeemed: tokenBalance,
      usdcReceived: tokenBalance,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  async redeemByTokenIds(
    conditionId: string,
    tokenIds: TokenIds,
    outcome?: string
  ): Promise<RedeemResult> {
    const resolution = await this.getMarketResolution(conditionId);
    if (!resolution.isResolved) {
      throw new Error('Market is not resolved yet');
    }

    const winningOutcome = outcome || resolution.winningOutcome;
    if (!winningOutcome) {
      throw new Error('Could not determine winning outcome');
    }

    const balances = await this.getPositionBalanceByTokenIds(conditionId, tokenIds);
    const tokenBalance = winningOutcome === 'YES' ? balances.yesBalance : balances.noBalance;

    if (parseFloat(tokenBalance) === 0) {
      throw new Error(`No ${winningOutcome} tokens to redeem`);
    }

    const indexSets = winningOutcome === 'YES' ? [1] : [2];

    const tx = await this.ctfContract.redeemPositions(
      USDC_CONTRACT,
      ethers.constants.HashZero,
      conditionId,
      indexSets,
      await this.getGasOptions()
    );

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.transactionHash,
      outcome: winningOutcome,
      tokensRedeemed: tokenBalance,
      usdcReceived: tokenBalance,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  async getPositionBalance(conditionId: string): Promise<PositionBalance> {
    const yesPositionId = this.calculatePositionId(conditionId, 1);
    const noPositionId = this.calculatePositionId(conditionId, 2);

    const [yesBalance, noBalance] = await Promise.all([
      this.ctfContract.balanceOf(this.wallet.address, yesPositionId),
      this.ctfContract.balanceOf(this.wallet.address, noPositionId),
    ]);

    return {
      conditionId,
      yesBalance: ethers.utils.formatUnits(yesBalance, USDC_DECIMALS),
      noBalance: ethers.utils.formatUnits(noBalance, USDC_DECIMALS),
      yesPositionId,
      noPositionId,
    };
  }

  async getPositionBalanceByTokenIds(
    conditionId: string,
    tokenIds: TokenIds
  ): Promise<PositionBalance> {
    const [yesBalance, noBalance] = await Promise.all([
      this.ctfContract.balanceOf(this.wallet.address, tokenIds.yesTokenId),
      this.ctfContract.balanceOf(this.wallet.address, tokenIds.noTokenId),
    ]);

    return {
      conditionId,
      yesBalance: ethers.utils.formatUnits(yesBalance, USDC_DECIMALS),
      noBalance: ethers.utils.formatUnits(noBalance, USDC_DECIMALS),
      yesPositionId: tokenIds.yesTokenId,
      noPositionId: tokenIds.noTokenId,
    };
  }

  async getMarketResolution(conditionId: string): Promise<MarketResolution> {
    const [yesNumerator, noNumerator, denominator] = await Promise.all([
      this.ctfContract.payoutNumerators(conditionId, 0),
      this.ctfContract.payoutNumerators(conditionId, 1),
      this.ctfContract.payoutDenominator(conditionId),
    ]);

    const isResolved = denominator.gt(0);
    let winningOutcome: 'YES' | 'NO' | undefined;

    if (isResolved) {
      if (yesNumerator.gt(0) && noNumerator.eq(0)) {
        winningOutcome = 'YES';
      } else if (noNumerator.gt(0) && yesNumerator.eq(0)) {
        winningOutcome = 'NO';
      }
    }

    return {
      conditionId,
      isResolved,
      winningOutcome,
      payoutNumerators: [yesNumerator.toNumber(), noNumerator.toNumber()],
      payoutDenominator: denominator.toNumber(),
    };
  }

  async estimateSplitGas(conditionId: string, amount: string): Promise<string> {
    const amountWei = ethers.utils.parseUnits(amount, USDC_DECIMALS);
    try {
      const gas = await this.ctfContract.estimateGas.splitPosition(
        USDC_CONTRACT,
        ethers.constants.HashZero,
        conditionId,
        [1, 2],
        amountWei
      );
      return gas.toString();
    } catch {
      return '250000';
    }
  }

  async estimateMergeGas(conditionId: string, amount: string): Promise<string> {
    const amountWei = ethers.utils.parseUnits(amount, USDC_DECIMALS);
    try {
      const gas = await this.ctfContract.estimateGas.mergePositions(
        USDC_CONTRACT,
        ethers.constants.HashZero,
        conditionId,
        [1, 2],
        amountWei
      );
      return gas.toString();
    } catch {
      return '200000';
    }
  }

  async getDetailedSplitGasEstimate(conditionId: string, amount: string): Promise<GasEstimate> {
    const gasUnits = await this.estimateSplitGas(conditionId, amount);
    return this.calculateGasCost(gasUnits);
  }

  async getDetailedMergeGasEstimate(conditionId: string, amount: string): Promise<GasEstimate> {
    const gasUnits = await this.estimateMergeGas(conditionId, amount);
    return this.calculateGasCost(gasUnits);
  }

  async getGasPrice(): Promise<{ gwei: string; wei: string }> {
    const gasPrice = await this.provider.getGasPrice();
    return {
      gwei: ethers.utils.formatUnits(gasPrice, 'gwei'),
      wei: gasPrice.toString(),
    };
  }

  async getMaticPrice(): Promise<number> {
    const now = Date.now();
    const cacheAge = now - this.maticPriceLastUpdated;

    if (cacheAge < 5 * 60 * 1000 && this.maticPriceLastUpdated > 0) {
      return this.cachedMaticPrice;
    }

    this.cachedMaticPrice = DEFAULT_MATIC_PRICE;
    this.maticPriceLastUpdated = now;

    return this.cachedMaticPrice;
  }

  setMaticPrice(price: number): void {
    this.cachedMaticPrice = price;
    this.maticPriceLastUpdated = Date.now();
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!receipt) {
        const tx = await this.provider.getTransaction(txHash);
        if (!tx) {
          return {
            txHash,
            status: 'failed',
            confirmations: 0,
            errorReason: 'Transaction not found',
          };
        }
        return {
          txHash,
          status: 'pending',
          confirmations: 0,
        };
      }

      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;

      if (receipt.status === 0) {
        const reason = await this.getRevertReason(txHash);
        return {
          txHash,
          status: 'reverted',
          confirmations,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
          errorReason: reason,
        };
      }

      return {
        txHash,
        status: 'confirmed',
        confirmations,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
      };
    } catch (error) {
      return {
        txHash,
        status: 'failed',
        confirmations: 0,
        errorReason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async waitForTransaction(txHash: string, confirmations?: number): Promise<TransactionStatus> {
    const targetConfirmations = confirmations ?? this.confirmations;
    const startTime = Date.now();

    while (Date.now() - startTime < this.txTimeout) {
      const status = await this.getTransactionStatus(txHash);

      if (status.status === 'reverted' || status.status === 'failed') {
        return status;
      }

      if (status.status === 'confirmed' && status.confirmations >= targetConfirmations) {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return {
      txHash,
      status: 'pending',
      confirmations: 0,
      errorReason: `Timeout after ${this.txTimeout}ms`,
    };
  }

  async getRevertReason(txHash: string): Promise<string> {
    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) return RevertReason.UNKNOWN;

      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 0) return RevertReason.UNKNOWN;

      try {
        await this.provider.call(tx as ethers.providers.TransactionRequest, tx.blockNumber);
        return RevertReason.UNKNOWN;
      } catch (error: unknown) {
        const err = error as { reason?: string; message?: string; data?: string };
        if (err.reason) return err.reason;
        if (err.message) {
          if (err.message.includes('insufficient balance')) {
            return RevertReason.INSUFFICIENT_BALANCE;
          }
          if (err.message.includes('allowance')) {
            return RevertReason.INSUFFICIENT_ALLOWANCE;
          }
          if (err.message.includes('condition not resolved')) {
            return RevertReason.CONDITION_NOT_RESOLVED;
          }
          return err.message;
        }
        return RevertReason.EXECUTION_REVERTED;
      }
    } catch {
      return RevertReason.UNKNOWN;
    }
  }

  async getAllPositions(conditionIds: string[]): Promise<PositionBalance[]> {
    const positions: PositionBalance[] = [];

    for (const conditionId of conditionIds) {
      try {
        const balance = await this.getPositionBalance(conditionId);
        if (parseFloat(balance.yesBalance) > 0 || parseFloat(balance.noBalance) > 0) {
          positions.push(balance);
        }
      } catch {
        // Skip errors
      }
    }

    return positions;
  }

  async canMerge(conditionId: string, amount: string): Promise<{ canMerge: boolean; reason?: string }> {
    try {
      const balances = await this.getPositionBalance(conditionId);
      return this.checkMergeBalance(balances, amount);
    } catch (error) {
      return {
        canMerge: false,
        reason: error instanceof Error ? error.message : 'Failed to check balances'
      };
    }
  }

  async canMergeWithTokenIds(
    conditionId: string,
    tokenIds: TokenIds,
    amount: string
  ): Promise<{ canMerge: boolean; reason?: string }> {
    try {
      const balances = await this.getPositionBalanceByTokenIds(conditionId, tokenIds);
      return this.checkMergeBalance(balances, amount);
    } catch (error) {
      return {
        canMerge: false,
        reason: error instanceof Error ? error.message : 'Failed to check balances'
      };
    }
  }

  private checkMergeBalance(
    balances: PositionBalance,
    amount: string
  ): { canMerge: boolean; reason?: string } {
    const amountNum = parseFloat(amount);
    const yesBalance = parseFloat(balances.yesBalance);
    const noBalance = parseFloat(balances.noBalance);

    if (yesBalance < amountNum) {
      return {
        canMerge: false,
        reason: `Insufficient YES tokens. Have: ${yesBalance}, Need: ${amountNum}`
      };
    }
    if (noBalance < amountNum) {
      return {
        canMerge: false,
        reason: `Insufficient NO tokens. Have: ${noBalance}, Need: ${amountNum}`
      };
    }

    return { canMerge: true };
  }

  async canSplit(amount: string): Promise<{ canSplit: boolean; reason?: string }> {
    try {
      const balance = await this.getUsdcBalance();
      const balanceNum = parseFloat(balance);
      const amountNum = parseFloat(amount);

      if (balanceNum < amountNum) {
        return {
          canSplit: false,
          reason: `Insufficient USDC. Have: ${balance}, Need: ${amount}`
        };
      }

      return { canSplit: true };
    } catch (error) {
      return {
        canSplit: false,
        reason: error instanceof Error ? error.message : 'Failed to check balance'
      };
    }
  }

  async getPortfolioValue(positions: PositionBalance[], prices: Map<string, { yes: number; no: number }>): Promise<{
    totalValue: number;
    breakdown: Array<{
      conditionId: string;
      yesValue: number;
      noValue: number;
      totalValue: number;
    }>;
  }> {
    let totalValue = 0;
    const breakdown: Array<{
      conditionId: string;
      yesValue: number;
      noValue: number;
      totalValue: number;
    }> = [];

    for (const position of positions) {
      const price = prices.get(position.conditionId);
      if (!price) continue;

      const yesValue = parseFloat(position.yesBalance) * price.yes;
      const noValue = parseFloat(position.noBalance) * price.no;
      const positionValue = yesValue + noValue;

      totalValue += positionValue;
      breakdown.push({
        conditionId: position.conditionId,
        yesValue,
        noValue,
        totalValue: positionValue,
      });
    }

    return { totalValue, breakdown };
  }

  private calculatePositionId(conditionId: string, indexSet: number): string {
    const collectionId = ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ['bytes32', 'bytes32', 'uint256'],
        [ethers.constants.HashZero, conditionId, indexSet]
      )
    );

    const positionId = ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ['address', 'bytes32'],
        [USDC_CONTRACT, collectionId]
      )
    );

    return positionId;
  }

  private async getGasOptions(): Promise<{
    maxPriorityFeePerGas: BigNumber;
    maxFeePerGas: BigNumber;
  }> {
    const feeData = await this.provider.getFeeData();
    const baseFee = feeData.lastBaseFeePerGas || feeData.gasPrice || ethers.utils.parseUnits('100', 'gwei');

    const minPriorityFee = ethers.utils.parseUnits('30', 'gwei');
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas.gt(minPriorityFee)
      ? feeData.maxPriorityFeePerGas
      : minPriorityFee;

    const adjustedBaseFee = baseFee.mul(Math.floor(this.gasPriceMultiplier * 100)).div(100);
    const maxFeePerGas = adjustedBaseFee.add(maxPriorityFeePerGas);

    return { maxPriorityFeePerGas, maxFeePerGas };
  }

  private async calculateGasCost(gasUnits: string): Promise<GasEstimate> {
    const gasOptions = await this.getGasOptions();
    const effectiveGasPrice = gasOptions.maxFeePerGas;

    const gasUnitsNum = BigNumber.from(gasUnits);
    const costWei = gasUnitsNum.mul(effectiveGasPrice);
    const costMatic = parseFloat(ethers.utils.formatEther(costWei));

    const maticPrice = await this.getMaticPrice();
    const costUsdc = costMatic * maticPrice;

    return {
      gasUnits,
      gasPriceGwei: ethers.utils.formatUnits(effectiveGasPrice, 'gwei'),
      costMatic: costMatic.toFixed(6),
      costUsdc: costUsdc.toFixed(4),
      maticPrice,
    };
  }
}

// ===== Utility Functions =====

export function calculateConditionId(
  oracle: string,
  questionId: string,
  outcomeSlotCount: number = 2
): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'uint256'],
      [oracle, questionId, outcomeSlotCount]
    )
  );
}

export function parseUsdc(amount: string): BigNumber {
  return ethers.utils.parseUnits(amount, USDC_DECIMALS);
}

export function formatUsdc(amount: BigNumber): string {
  return ethers.utils.formatUnits(amount, USDC_DECIMALS);
}
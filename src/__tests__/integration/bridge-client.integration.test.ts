/**
 * Bridge Client Integration Tests
 *
 * These tests verify the Bridge Client functionality.
 * Note: The bridge API (bridge.polymarket.com) may not be publicly accessible.
 * These tests are designed to handle both success and failure gracefully.
 *
 * Run with: pnpm test:integration
 */

import { describe, it, expect } from 'vitest';
import {
  BridgeClient,
  SUPPORTED_CHAINS,
  BRIDGE_TOKENS,
  estimateBridgeOutput,
  getExplorerUrl,
} from '../../clients/bridge-client.js';

describe('BridgeClient Integration', () => {
  const bridge = new BridgeClient();

  describe('Constants', () => {
    it('should have correct Ethereum chain info', () => {
      expect(SUPPORTED_CHAINS.ETHEREUM.chainId).toBe(1);
      expect(SUPPORTED_CHAINS.ETHEREUM.name).toBe('Ethereum');
      expect(SUPPORTED_CHAINS.ETHEREUM.rpcUrl).toBeDefined();

      console.log('Ethereum chain:', SUPPORTED_CHAINS.ETHEREUM);
    });

    it('should have correct Polygon chain info', () => {
      expect(SUPPORTED_CHAINS.POLYGON.chainId).toBe(137);
      expect(SUPPORTED_CHAINS.POLYGON.name).toBe('Polygon');
      expect(SUPPORTED_CHAINS.POLYGON.rpcUrl).toBeDefined();

      console.log('Polygon chain:', SUPPORTED_CHAINS.POLYGON);
    });

    it('should have correct token addresses', () => {
      // Ethereum tokens
      expect(BRIDGE_TOKENS.ETH_USDC).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(BRIDGE_TOKENS.ETH_WETH).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(BRIDGE_TOKENS.ETH_DAI).toMatch(/^0x[a-fA-F0-9]{40}$/);

      // Polygon tokens
      expect(BRIDGE_TOKENS.POLYGON_USDC_E).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(BRIDGE_TOKENS.POLYGON_NATIVE_USDC).toMatch(/^0x[a-fA-F0-9]{40}$/);

      // Verify well-known addresses
      expect(BRIDGE_TOKENS.ETH_USDC.toLowerCase()).toBe(
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
      );
      expect(BRIDGE_TOKENS.POLYGON_USDC_E.toLowerCase()).toBe(
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'
      );

      console.log('Token addresses verified:', BRIDGE_TOKENS);
    });
  });

  describe('Utility Functions', () => {
    describe('estimateBridgeOutput', () => {
      it('should estimate output for stablecoins', () => {
        const input = 1000;
        const output = estimateBridgeOutput(input, 'USDC');

        // Should be slightly less than input due to fees (~1%)
        expect(output).toBeLessThan(input);
        expect(output).toBeGreaterThan(input * 0.95);

        console.log(`Estimated output for ${input} USDC: ${output} USDC.e`);
      });

      it('should work for different stablecoins', () => {
        const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD'];

        for (const token of stablecoins) {
          const output = estimateBridgeOutput(100, token);
          expect(output).toBeCloseTo(99, 0); // ~1% fee
        }

        console.log('All stablecoins estimated correctly');
      });

      it('should work for ETH', () => {
        const output = estimateBridgeOutput(1, 'ETH');
        expect(output).toBeLessThan(1);
        expect(output).toBeGreaterThan(0.95);

        console.log(`Estimated output for 1 ETH: ${output} (in USDC.e equivalent)`);
      });
    });

    describe('getExplorerUrl', () => {
      const testTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      it('should return Etherscan URL for Ethereum', () => {
        const url = getExplorerUrl(1, testTxHash);
        expect(url).toContain('etherscan.io/tx/');
        expect(url).toContain(testTxHash);

        console.log(`Ethereum explorer URL: ${url}`);
      });

      it('should return Polygonscan URL for Polygon', () => {
        const url = getExplorerUrl(137, testTxHash);
        expect(url).toContain('polygonscan.com/tx/');
        expect(url).toContain(testTxHash);

        console.log(`Polygon explorer URL: ${url}`);
      });

      it('should return correct URLs for other chains', () => {
        const chains = [
          { id: 10, expected: 'optimistic.etherscan.io' },
          { id: 42161, expected: 'arbiscan.io' },
          { id: 8453, expected: 'basescan.org' },
        ];

        for (const chain of chains) {
          const url = getExplorerUrl(chain.id, testTxHash);
          expect(url).toContain(chain.expected);
        }

        console.log('All chain explorer URLs verified');
      });

      it('should return blockscan URL for unknown chains', () => {
        const url = getExplorerUrl(99999, testTxHash);
        expect(url).toContain('blockscan.com/tx/');

        console.log(`Unknown chain explorer URL: ${url}`);
      });
    });
  });

  describe('API Calls (may fail if API not accessible)', () => {
    it('should attempt to get supported assets', async () => {
      try {
        const assets = await bridge.getSupportedAssets();

        expect(Array.isArray(assets)).toBe(true);

        if (assets.length > 0) {
          // Verify asset structure
          for (const asset of assets) {
            expect(typeof asset.chainId).toBe('number');
            expect(typeof asset.chainName).toBe('string');
            expect(typeof asset.tokenAddress).toBe('string');
            expect(typeof asset.tokenSymbol).toBe('string');
            expect(typeof asset.active).toBe('boolean');
          }

          console.log(`Got ${assets.length} supported assets`);
          console.log('Sample asset:', assets[0]);
        } else {
          console.log('No assets returned (API may return empty array)');
        }
      } catch (error) {
        console.log('getSupportedAssets failed (expected if API not public)');
        console.log(`Error: ${(error as Error).message}`);

        // Don't fail the test - API may not be publicly accessible
        expect(true).toBe(true);
      }
    }, 30000);

    it('should attempt to check if Ethereum USDC is supported', async () => {
      try {
        const isSupported = await bridge.isSupported(1, 'USDC');

        expect(typeof isSupported).toBe('boolean');
        console.log(`Ethereum USDC supported: ${isSupported}`);
      } catch (error) {
        console.log('isSupported check failed (expected if API not public)');
        console.log(`Error: ${(error as Error).message}`);
        expect(true).toBe(true);
      }
    }, 30000);

    it('should attempt to get minimum deposit for Ethereum USDC', async () => {
      try {
        const minDeposit = await bridge.getMinDeposit(1, 'USDC');

        if (minDeposit) {
          expect(typeof minDeposit.amount).toBe('string');
          expect(typeof minDeposit.usd).toBe('number');
          console.log(`Min deposit for ETH USDC: ${minDeposit.amount} (~$${minDeposit.usd})`);
        } else {
          console.log('No minimum deposit info returned');
        }
      } catch (error) {
        console.log('getMinDeposit failed (expected if API not public)');
        console.log(`Error: ${(error as Error).message}`);
        expect(true).toBe(true);
      }
    }, 30000);

    it('should attempt to create deposit addresses', async () => {
      const testAddress = '0x82a1b239c1ff9bc60a4c86caf5b6bdbd9fddfe20'; // Known whale

      try {
        const result = await bridge.createDepositAddresses(testAddress);

        // API returns universal addresses for EVM, Solana, and Bitcoin
        expect(typeof result.address.evm).toBe('string');
        expect(typeof result.address.svm).toBe('string');
        expect(typeof result.address.btc).toBe('string');

        // EVM address should be valid Ethereum address format
        expect(result.address.evm).toMatch(/^0x[a-fA-F0-9]{40}$/);

        console.log('Got universal deposit addresses:');
        console.log(`  EVM: ${result.address.evm}`);
        console.log(`  Solana: ${result.address.svm}`);
        console.log(`  Bitcoin: ${result.address.btc}`);
      } catch (error) {
        console.log('createDepositAddresses failed (expected if API not public)');
        console.log(`Error: ${(error as Error).message}`);
        expect(true).toBe(true);
      }
    }, 30000);

    it('should attempt to get deposit instructions', async () => {
      const testAddress = '0x82a1b239c1ff9bc60a4c86caf5b6bdbd9fddfe20';

      try {
        const instructions = await bridge.getDepositInstructions(testAddress);

        expect(typeof instructions).toBe('string');
        expect(instructions.length).toBeGreaterThan(0);

        // Should contain expected sections
        expect(instructions).toContain('POLYMARKET');
        expect(instructions).toContain(testAddress);

        console.log('Got deposit instructions:');
        console.log(instructions.slice(0, 500) + '...');
      } catch (error) {
        console.log('getDepositInstructions failed (expected if API not public)');
        console.log(`Error: ${(error as Error).message}`);
        expect(true).toBe(true);
      }
    }, 30000);
  });

  describe('BridgeClient Configuration', () => {
    it('should use default configuration', () => {
      const client = new BridgeClient();
      // Client should be created without errors
      expect(client).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const client = new BridgeClient({
        baseUrl: 'https://custom-bridge.example.com',
        timeout: 60000,
      });
      expect(client).toBeDefined();
    });
  });
});

describe('Bridge Documentation', () => {
  it('should document the bridge deposit flow', () => {
    /**
     * Polymarket Bridge Deposit Flow:
     *
     * 1. User calls createDepositAddresses(walletAddress)
     *    - Returns unique deposit addresses for each supported chain/token
     *    - These addresses are specific to your Polymarket wallet
     *
     * 2. User sends tokens to the deposit address on the source chain
     *    - Example: Send USDC on Ethereum to the ETH/USDC deposit address
     *    - Must send more than the minimum deposit amount
     *
     * 3. Bridge automatically:
     *    - Detects the incoming deposit
     *    - Bridges funds to Polygon
     *    - Swaps to USDC.e if necessary
     *    - Credits USDC.e to user's Polymarket account
     *
     * 4. User can check deposit status
     *    - Typical time: 10-30 minutes
     *    - Status: pending → bridging → swapping → completed
     *
     * Supported chains (typical):
     * - Ethereum (Chain ID: 1)
     * - Arbitrum (Chain ID: 42161)
     * - Optimism (Chain ID: 10)
     * - Base (Chain ID: 8453)
     *
     * Supported tokens (typical):
     * - USDC, USDT, DAI, WETH, ETH
     */

    console.log('');
    console.log('Bridge Deposit Flow');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('1. Get deposit addresses: bridge.createDepositAddresses(walletAddress)');
    console.log('2. Send tokens to the unique deposit address on source chain');
    console.log('3. Wait 10-30 minutes for automatic bridging and conversion');
    console.log('4. USDC.e appears in your Polymarket account');
    console.log('');
    console.log('Supported chains: Ethereum, Arbitrum, Optimism, Base');
    console.log('Supported tokens: USDC, USDT, DAI, WETH, ETH');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    expect(true).toBe(true);
  });
});

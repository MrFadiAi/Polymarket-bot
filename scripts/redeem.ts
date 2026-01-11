import { OnchainService } from '../src/index.js';

interface RedeemTarget {
  wallet: string;
  privateKeyEnv: string;
  conditionId: string;
  description: string;
}

const targets: RedeemTarget[] = [
  // Main wallet - ETH 7:15-7:30AM Up (+$24.71)
  {
    wallet: 'main',
    privateKeyEnv: 'POLY_PRIVATE_KEY_1',
    conditionId: '0x0be9ec4ae7d1c374122a755f7d930fbfd1b00da33627a43a322f300d74a3e65a',
    description: 'ETH 1/6 7:15-7:30AM Up',
  },
  // Main wallet - ETH 7:30-7:45AM Down (+$10.96)
  {
    wallet: 'main',
    privateKeyEnv: 'POLY_PRIVATE_KEY_1',
    conditionId: '0x08caf197ee16ea30ddb9851a4301b64b44b74daab1c1f463756e1b33bfe29205',
    description: 'ETH 1/6 7:30-7:45AM Down',
  },
  // Trading wallet - XRP 6:45-7:00AM Up (+$39.60)
  {
    wallet: 'trading',
    privateKeyEnv: 'POLY_PRIVATE_KEY_2',
    conditionId: '0x79a69ec0b35741ad37db9b2043eaf635731cbfdfccb8a7314c4a0cd70f21d097',
    description: 'XRP 1/6 6:45-7:00AM Up',
  },
];

async function main() {
  console.log('=== Redeeming winning positions ===\n');

  for (const target of targets) {
    console.log(`\n[${target.wallet}] ${target.description}`);
    console.log(`  ConditionId: ${target.conditionId}`);

    const privateKey = process.env[target.privateKeyEnv];
    if (!privateKey) {
      console.log(`  ERROR: ${target.privateKeyEnv} not set`);
      continue;
    }

    try {
      const service = new OnchainService({
        privateKey,
        rpcUrl: 'https://polygon-rpc.com',
      });

      // Check resolution
      const resolution = await service.getMarketResolution(target.conditionId);
      const resolutionStatus = resolution.isResolved
        ? `Yes - ${resolution.winningOutcome} wins`
        : 'Not resolved';
      console.log(`  Resolution: ${resolutionStatus}`);

      if (!resolution.isResolved) {
        console.log(`  SKIP: not resolved yet`);
        continue;
      }

      // Get position balance
      const balance = await service.getPositionBalance(target.conditionId);
      console.log(`  Balance: YES=${balance.yesBalance}, NO=${balance.noBalance}`);

      const hasYes = parseFloat(balance.yesBalance) > 0;
      const hasNo = parseFloat(balance.noBalance) > 0;

      if (!hasYes && !hasNo) {
        console.log(`  SKIP: no tokens to redeem`);
        continue;
      }

      // Redeem
      const result = await service.redeem(target.conditionId);
      console.log(`  SUCCESS: Redeemed ${result.tokensRedeemed} tokens -> ${result.usdcReceived} USDC`);
      console.log(`  TX: https://polygonscan.com/tx/${result.txHash}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR: ${message}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);

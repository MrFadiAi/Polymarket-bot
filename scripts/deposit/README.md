# Deposit Scripts

Polymarket deposit and token management tools.

## Usage

```bash
PRIVATE_KEY=0x... npx tsx scripts/deposit/deposit.ts [command] [amount]
```

## Commands

| Command | Description |
|---------|-------------|
| `check` | Check balances and trading allowances (default) |
| `approve` | Set up all required trading approvals |
| `swap <amount>` | Swap Native USDC to USDC.e via QuickSwap |
| `deposit <amount>` | Deposit Native USDC to Polymarket via Bridge |

## Examples

```bash
# Check wallet status
PRIVATE_KEY=0x... npx tsx scripts/deposit/deposit.ts check

# Approve trading contracts
PRIVATE_KEY=0x... npx tsx scripts/deposit/deposit.ts approve

# Swap 100 USDC to USDC.e
PRIVATE_KEY=0x... npx tsx scripts/deposit/deposit.ts swap 100

# Deposit 50 USDC to Polymarket
PRIVATE_KEY=0x... npx tsx scripts/deposit/deposit.ts deposit 50
```

## Notes

- Minimum deposit: $2
- Deposit processing: 1-5 minutes via Polymarket Bridge
- Uses `OnchainService` from poly-sdk for all operations

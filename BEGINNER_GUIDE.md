# 📘 Complete Beginner's Guide to Polymarket Trading Bot

**A Step-by-Step Guide for Complete Beginners**

---

## 📋 Table of Contents

1. [What is Polymarket?](#what-is-polymarket)
2. [What is This Trading Bot?](#what-is-this-trading-bot)
3. [What You Need Before Starting](#what-you-need-before-starting)
4. [Understanding Basic Concepts](#understanding-basic-concepts)
5. [Step-by-Step Installation](#step-by-step-installation)
6. [Running Your First Example](#running-your-first-example)
7. [Understanding the Examples](#understanding-the-examples)
8. [Setting Up Your Wallet for Trading](#setting-up-your-wallet-for-trading)
9. [Trading Safely - Important Warnings](#trading-safely---important-warnings)
10. [Customizing the Bot](#customizing-the-bot)
11. [Troubleshooting Common Issues](#troubleshooting-common-issues)
12. [Next Steps](#next-steps)

---

## What is Polymarket?

### 🎯 The Simple Explanation

Polymarket is a **prediction market** platform where you can:

- **Buy "YES" or "NO" positions** on future events
- Example: "Will Bitcoin reach $100,000 in 2025?"
- If you think YES will happen, you buy YES tokens
- If you think NO will happen, you buy NO tokens

### 💰 How You Make Money

1. **Buy a position**: You buy YES tokens at $0.50 (50 cents)
2. **Wait for the event**: The question is answered
3. **Get paid**: If you're right, your tokens are worth $1.00 (100 cents)
4. **Profit**: You earned $0.50 per token (100% profit in this example)

### 🎲 Example: Trading on a Prediction

**Market**: "Will Trump win the 2024 election?"

- **You buy 100 YES tokens at $0.60** (you paid $60)
- **Election happens and Trump wins**
- **Your YES tokens become worth $1.00 each**
- **You receive $100** (you made $40 profit!)

**OR**

- **Election happens and Trump loses**
- **Your YES tokens become worth $0.00 each**
- **You receive $0** (you lost your $60)

⚠️ **Key Rule**: The YES and NO prices always add up to $1.00. If YES costs $0.60, NO costs $0.40.

---

## What is This Trading Bot?

### 🤖 What Does It Do?

This is a **software tool** that automatically:

1. **Monitors markets**: Watches prediction markets on Polymarket 24/7
2. **Finds opportunities**: Detects when prices are wrong (arbitrage)
3. **Can trade automatically**: Buy/sell positions without you being there
4. **Analyzes data**: Looks at "smart money" (professional traders)
5. **Calculates profit**: Shows you potential arbitrage opportunities

### 🎛️ Main Features

| Feature | What It Does | Why It's Useful |
|----------|---------------|------------------|
| **Market Scanner** | Scans all markets for trading opportunities | Don't miss profitable trades |
| **Arbitrage Detector** | Finds YES+NO price mismatches | Risk-free profit opportunities |
| **Smart Money Tracker** | Follows successful traders | Copy what winners are doing |
| **Auto Trading** | Places trades automatically | Trade while you sleep |
| **Real-time Data** | Gets live prices via WebSocket | React instantly to price changes |
| **Portfolio Management** | Tracks your positions and profits | Know exactly how you're doing |

### 🎯 Who Should Use This?

- ✅ People who want to **automate trading** on Polymarket
- ✅ People interested in **arbitrage strategies**
- ✅ People who want to **copy successful traders**
- ✅ People with some **programming knowledge** (or willing to learn)

❌ This is NOT for:
- People wanting to get rich quickly without effort
- People unwilling to learn basic command line usage
- People wanting to use small amounts (<$10 recommended minimum)

---

## What You Need Before Starting

### 🔧 Technical Requirements

#### Computer & Software

- **Any computer** (Windows, Mac, Linux)
- **Node.js installed** (version 18 or higher)
  - Download from: https://nodejs.org/
  - Or use: `nvm` (Node Version Manager) for Mac/Linux
- **Git installed** (optional but recommended)
  - Download from: https://git-scm.com/
- **A text editor** (for editing code)
  - VS Code (recommended): https://code.visualstudio.com/
  - Or any text editor

#### Checking Your Setup

Open your terminal (Command Prompt on Windows) and run:

```bash
# Check Node.js version
node --version

# Should show something like: v20.17.0 or higher
```

If you see an error, you need to install Node.js first.

### 💰 Financial Requirements

#### For Testing (Read-Only Mode)
- **$0 required** - You can run examples without trading
- Good for learning how the bot works

#### For Real Trading
- **Minimum: $10-50** - To see meaningful results
- **Recommended: $100+** - For effective arbitrage strategies
- **You'll need:**
  1. **USDC tokens** on Polygon network (stabelcoin worth $1 each)
  2. **A bit of MATIC** (for gas fees, about $1-5 worth)

#### Where to Get Funds

1. **Buy USDC on a CEX** (Coinbase, Binance, Kraken)
2. **Transfer to your wallet** on Polygon network
3. **Use a bridge** if needed (Polymarket is on Polygon)

### 🔐 Security Requirements

#### ⚠️ CRITICAL: Never Share Your Private Key

Your private key is like your **bank card PIN and password combined**.

✅ **DO**:
- Store it in a secure password manager
- Keep it offline if possible
- Use environment variables (we'll teach you how)

❌ **NEVER**:
- Put it in code files
- Share it with anyone
- Save it in cloud storage (unless encrypted)
- Commit it to GitHub/Git

---

## Understanding Basic Concepts

### 💱 What is Arbitrage?

**Arbitrage** = **Risk-free profit** from price differences.

#### Simple Example

Imagine two candy stores next to each other:

- **Store A**: Selling chocolate for $1.00
- **Store B**: Buying chocolate for $1.10

**Arbitrage opportunity**:
1. Buy chocolate from Store A for $1.00
2. Sell it to Store B for $1.10
3. **Profit: $0.10 (risk-free!)**

#### Polymarket Arbitrage

In Polymarket, you can buy both YES and NO tokens for the same market.

**Example**:
- YES price: $0.45
- NO price: $0.52
- **Total cost: $0.97**

**Why this is profit**:
- Since YES+NO = $1.00, buying both for $0.97 means you're getting $1.00 worth of value for $0.97
- When the market resolves, one wins ($1.00) and one loses ($0.00)
- **You make $0.03 per pair (risk-free!)**

### 📊 What is an Orderbook?

An **orderbook** shows all buy and sell orders at different prices.

**Example Orderbook for YES token**:

```
ASKS (people selling)           BIDS (people buying)
Price     Size                Price     Size
$0.55     100 shares          $0.50     50 shares
$0.54     200 shares          $0.49     75 shares
$0.53     150 shares          $0.48     100 shares
```

- **Best Ask**: $0.53 (lowest price sellers accept)
- **Best Bid**: $0.50 (highest price buyers pay)
- **Spread**: $0.53 - $0.50 = $0.03 (3 cents)

### 🏦 What is CLOB?

**CLOB** = **Central Limit Order Book**

It's like a stock market where:
- Everyone places orders (I want to buy at $X)
- Orders are matched automatically
- Best prices execute first
- No middleman takes a cut (unlike traditional sportsbooks)

### 🪙 What are Tokens?

On Polymarket, "tokens" represent your position:

- **YES token**: If you own this, you win if YES happens
- **NO token**: If you own this, you win if NO happens
- **Token ID**: Unique number identifying the token (used by the bot)

**After resolution**:
- Winning tokens = worth $1.00 each
- Losing tokens = worth $0.00 each

### 🤔 What is "Smart Money"?

"Smart money" refers to traders who consistently make profit:
- **High win rate**: They win more than they lose
- **Large volume**: They trade significant amounts
- **Good timing**: They enter/exit at the right times

The bot can **track these traders** and optionally **copy their trades**.

---

## Step-by-Step Installation

### Step 1: Verify Your Computer is Ready

#### 1.1 Check Node.js Installation

Open your terminal and type:

```bash
node --version
```

**Expected output**: `v18.x.x` or `v20.x.x` (or higher)

**If you see "command not found"**:
- Go to https://nodejs.org/
- Download the LTS version (recommended)
- Install it (follow the installer instructions)
- Restart your terminal
- Check again with `node --version`

#### 1.2 Check NPM (Package Manager)

```bash
npm --version
```

**Expected output**: `9.x.x` or `10.x.x` (or higher)

If npm isn't working, reinstall Node.js.

---

### Step 2: Download the Bot Code

#### Option A: You Already Have the Code

If you're reading this from the `Polymarket` folder, you're ready!

**Verify files exist**:
```bash
ls
```

You should see: `src`, `examples`, `package.json`, `README.md`, etc.

#### Option B: Clone from GitHub

```bash
# If you have Git installed
git clone https://github.com/cyl19970726/poly-sdk.git
cd poly-sdk
```

#### Option C: Download ZIP

1. Go to: https://github.com/cyl19970726/poly-sdk
2. Click "Code" (green button)
3. Click "Download ZIP"
4. Extract the ZIP file
5. Move to a folder you'll remember

---

### Step 3: Install Dependencies

The bot needs extra software packages to run. We install them with npm.

#### 3.1 Navigate to the Project Folder

```bash
cd D:\SynologyDrive\Ai\Polymarket
```

(Use your actual path, this is just an example)

#### 3.2 Install Packages

```bash
npm install
```

**What this does**:
- Downloads all required packages from the internet
- Creates a `node_modules` folder
- May take 1-5 minutes depending on internet speed

**Expected output**:
```
added 153 packages, and audited 154 packages in Xs
```

**If you see errors**:
- Make sure you have internet connection
- Try running: `npm install --force`
- Delete `node_modules` folder and try again

---

### Step 4: Build the Project

The code is written in TypeScript. We need to convert it to JavaScript.

```bash
npm run build
```

**Expected output**: No errors, just returns to prompt

**Success indicators**:
- A `dist` folder is created
- No error messages
- Returns to command line

**If you see TypeScript errors**:
- Make sure Node.js is up to date
- Check that all files are present
- Contact support if issues persist

---

### Step 5: Verify Installation

Run the basic example to make sure everything works:

```bash
npx tsx examples/01-basic-usage.ts
```

**Expected output**:
```
=== Polymarket SDK Basic Usage ===

1. Fetching trending markets...
   Found 5 trending markets:
   ...
```

**If this works, congratulations! You're ready to use the bot!**

---

## Running Your First Example

### 🚀 Example 1: Basic Usage (Read-Only)

This example shows how to:
- Get trending markets
- See market details
- Check prices
- Detect arbitrage opportunities

#### How to Run:

```bash
npx tsx examples/01-basic-usage.ts
```

#### What You'll See:

```
1. Fetching trending markets...
   Found 5 trending markets:

   - [Market Question]
     Slug: market-slug-here
     Volume: $1,234,567
     24h Volume: $123,456
     Prices: Yes=0.45, No=0.55
```

#### Understanding the Output:

- **Slug**: URL-friendly name of the market
- **Volume**: Total money traded on this market
- **24h Volume**: Money traded in last 24 hours
- **Prices**: Current YES and NO token prices

---

## Understanding the Examples

The bot comes with **13 example files** to help you learn. Here's what each does:

### 📚 Example 01: Basic Usage
**File**: `examples/01-basic-usage.ts`

**What it does**:
- Fetches trending markets (top 5 by volume)
- Shows market details (question, prices, volume)
- Gets orderbook data
- Calculates arbitrage opportunities

**Best for**: First-time users to understand the basics

**How to run**:
```bash
npx tsx examples/01-basic-usage.ts
```

---

### 💰 Example 02: Smart Money Analysis
**File**: `examples/02-smart-money.ts`

**What it does**:
- Gets the leaderboard (top traders)
- Shows their PnL (profit/loss)
- Shows their positions (what they're betting on)
- Shows their recent activity
- Finds active wallets from recent trades

**Best for**: Finding good traders to follow or learn from

**How to run**:
```bash
npx tsx examples/02-smart-money.ts
```

---

### 📊 Example 03: Market Analysis
**File**: `examples/03-market-analysis.ts`

**What it does**:
- Scans multiple markets
- Checks for arbitrage in each
- Analyzes market depth (how much liquidity)
- Shows imbalance ratio (buy vs sell pressure)

**Best for**: Finding trading opportunities

**How to run**:
```bash
npx tsx examples/03-market-analysis.ts
```

---

### 📈 Example 04: K-Line Aggregation
**File**: `examples/04-kline-aggregation.ts`

**What it does**:
- Gets trade history for a market
- Aggregates into K-Line candles (like stock market charts)
- Shows OHLCV (Open, High, Low, Close, Volume) data
- Separates YES and NO token data

**Best for**: Technical analysis and charting

**How to run**:
```bash
npx tsx examples/04-kline-aggregation.ts
```

**What is a K-Line?**
K-Line (also called "candlestick") summarizes price movement over a time period:
- **Open**: Price at start of period
- **High**: Highest price in period
- **Low**: Lowest price in period
- **Close**: Price at end of period
- **Volume**: Total amount traded

---

### 👥 Example 05: Follow Wallet Strategy
**File**: `examples/05-follow-wallet-strategy.ts`

**What it does**:
- Gets top traders from leaderboard
- Tracks their positions
- Detects when they sell (exit signal)
- Calculates sell ratio (how much they're selling)

**Best for**: Copying trader exit strategies

**How to run**:
```bash
npx tsx examples/05-follow-wallet-strategy.ts
```

**Strategy explained**:
- If a smart money trader sells 30%+ of their position, you might want to exit too
- Sell ratio > 30% = exit signal
- Sell ratio < 10% = holding strong

---

### 🛠️ Example 06: Services Demo
**File**: `examples/06-services-demo.ts`

**What it does**:
- Shows all SDK services working together
- WalletService (top traders, profiles)
- MarketService (K-Lines, market data)
- Real-time price updates

**Best for**: Seeing the full power of the SDK

**How to run**:
```bash
npx tsx examples/06-services-demo.ts
```

---

### 📡 Example 07: Real-time WebSocket
**File**: `examples/07-realtime-websocket.ts`

**What it does**:
- Connects to Polymarket WebSocket
- Subscribes to live price feeds
- Shows orderbook updates in real-time
- Shows trade executions as they happen

**Best for**: Understanding real-time data streaming

**How to run**:
```bash
npx tsx examples/07-realtime-websocket.ts
```

**What's the difference between WebSocket vs API?**
- **API**: You ask for data (polling)
- **WebSocket**: Data comes to you automatically (push)
- **WebSocket is faster** and uses fewer API calls

---

### 💳 Example 08: Trading Orders
**File**: `examples/08-trading-orders.ts`

**What it does**:
- Shows how to place different order types
- Demonstrates GTC, GTD, FOK, FAK orders
- Shows price utilities (rounding, validation)
- Calculates arbitrage
- Shows rewards tracking

**Best for**: Learning how to place real trades

**How to run**:
```bash
npx tsx examples/08-trading-orders.ts
```

**Important**: This example requires your private key (see "Setting Up Your Wallet" section)

**Order Types Explained**:

| Type | Name | When to Use |
|-------|-------|--------------|
| **GTC** | Good Till Cancelled | Default order, stays until filled or you cancel |
| **GTD** | Good Till Date | Auto-expires at specific time |
| **FOK** | Fill Or Kill | Must fill 100% or cancel (all or nothing) |
| **FAK** | Fill And Kill | Fill what you can, cancel the rest |

---

### 🏆 Example 09: Rewards Tracking
**File**: `examples/09-rewards-tracking.ts`

**What it does**:
- Finds markets with reward programs
- Shows reward rates (how much you earn)
- Checks if your orders are scoring
- Tracks your daily earnings

**Best for**: Understanding market making incentives

**How to run**:
```bash
npx tsx examples/09-rewards-tracking.ts
```

**What are rewards?**
Polymarket pays you extra for providing liquidity:
- Place orders on both sides of the market
- Keep narrow spreads (small difference between buy and sell)
- Earn daily rewards based on your order size and time

---

### 🔐 Example 10: CTF Operations
**File**: `examples/10-ctf-operations.ts`

**What it does**:
- Shows how to split USDC into YES+NO tokens
- Shows how to merge YES+NO back into USDC
- Shows how to redeem winning tokens
- Shows token approvals

**Best for**: Understanding on-chain operations

**How to run**:
```bash
npx tsx examples/10-ctf-operations.ts
```

**What is CTF?**
**CTF** = **Conditional Token Framework**
- Smart contract system for creating prediction market tokens
- Allows splitting collateral into outcome tokens
- Allows merging back or redeeming winners

**Operations**:
1. **Split**: USDC → YES + NO tokens
2. **Merge**: YES + NO → USDC (for arbitrage)
3. **Redeem**: Winning token → USDC (after resolution)

---

### 🔍 Example 11: Live Arbitrage Scan
**File**: `examples/11-live-arbitrage-scan.ts`

**What it does**:
- Continuously scans for arbitrage opportunities
- Shows profit opportunities in real-time
- Updates as prices change

**Best for**: Finding profitable trades to execute manually or automatically

**How to run**:
```bash
npx tsx examples/11-live-arbitrage-scan.ts
```

---

### 📊 Example 12: Trending Arbitrage Monitor
**File**: `examples/12-trending-arb-monitor.ts`

**What it does**:
- Monitors trending markets for arbitrage
- Shows market depth analysis
- Tracks spread changes over time
- Detects buy/sell pressure imbalances

**Best for**: Monitoring high-volume markets

**How to run**:
```bash
npx tsx examples/12-trending-arb-monitor.ts
```

---

### ⚡ Example 13: Arbitrage Service
**File**: `examples/13-arbitrage-service.ts`

**What it does**:
- Full arbitrage workflow
- Auto-detects opportunities
- Can auto-execute trades
- Manages positions
- Clears positions when done

**Best for**: Running an automated arbitrage bot

**How to run**:
```bash
npx tsx examples/13-arbitrage-service.ts
```

⚠️ **Warning**: This will trade automatically if configured. Only use with real money after thorough testing!

---

## Setting Up Your Wallet for Trading

### 💼 Step 1: Create or Import a Wallet

You need a wallet address that holds your funds.

#### Option A: Create New Wallet (for testing)

**With MetaMask**:
1. Install MetaMask extension in your browser
2. Click "Create Account"
3. Save your seed phrase (12-24 words) safely!
4. Copy your wallet address (0x...)

#### Option B: Use Existing Wallet

If you already have a wallet on Polymarket:
1. Get your private key (from MetaMask or other wallet)
2. We'll use this to configure the bot

---

### Step 2: Get Funds on Polygon Network

Polymarket uses the **Polygon** blockchain (network ID: 137).

#### 2.1 Understand Polygon

Polygon is a "sidechain" of Ethereum:
- **Faster**: Transactions complete in seconds
- **Cheaper**: Gas fees are pennies, not dollars
- **Compatible**: Uses same addresses as Ethereum

#### 2.2 Get USDC on Polygon

**Method 1: Direct Purchase**
- Use services like MoonPay, Ramp, or Transak
- Buy USDC directly on Polygon
- Send to your wallet address

**Method 2: Bridge from Ethereum**
1. Buy USDC on Ethereum (Coinbase, Binance, etc.)
2. Use a bridge (like Polymarket's bridge or official Polygon bridge)
3. Bridge USDC from Ethereum to Polygon
4. Wait ~10-30 minutes for confirmation

#### 2.3 Get MATIC for Gas

You need a small amount of MATIC for transaction fees:
- **Amount**: $1-5 worth of MATIC
- **Purpose**: Pay for trading operations
- **Where to buy**: Same places as USDC

---

### Step 3: Approve Tokens for Trading

Before trading, you must approve the Polymarket contracts.

#### Option A: Approve via Polymarket UI (Recommended for Beginners)

1. Go to https://polymarket.com/
2. Connect your wallet
3. Try to make a small trade
4. Approve USDC when prompted
5. This approves the contracts for trading

#### Option B: Approve via Bot (Advanced)

The bot can approve tokens programmatically:
```typescript
const onchain = new OnchainService({ privateKey: '0x...' });
await onchain.approveAll();
```

⚠️ **Warning**: Only approve if you understand what you're doing!

---

### Step 4: Set Environment Variables

Never put your private key in code files. Use environment variables.

#### 4.1 Create a `.env` File

Create a file named `.env` in your project folder:

```env
POLYMARKET_PRIVATE_KEY=0x1234567890abcdef...
```

Replace `0x1234567890abcdef...` with your actual private key.

#### 4.2 Add `.env` to `.gitignore`

Edit `.gitignore` file and add:
```
.env
```

This prevents accidentally committing your private key to git.

#### 4.3 Use Environment Variables in Code

```typescript
// ✅ CORRECT: Use environment variable
const privateKey = process.env.POLYMARKET_PRIVATE_KEY!;

// ❌ WRONG: Hardcode private key
const privateKey = '0x123...';
```

---

### Step 5: Configure the Bot for Trading

Create a file `bot-config.ts`:

```typescript
import { PolymarketSDK } from './dist/src/index.js';

async function main() {
  // Initialize with your wallet
  const sdk = await PolymarketSDK.create({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY!,
  });

  console.log('Bot initialized!');
  console.log('Wallet:', sdk.tradingService.getAddress());

  // Your trading logic here...

  // Clean up
  sdk.stop();
}

main().catch(console.error);
```

Run with:
```bash
npx tsx bot-config.ts
```

---

## Trading Safely - Important Warnings

### ⚠️ CRITICAL SAFETY RULES

#### 1. Start Small

- **Don't trade large amounts** immediately
- Start with $10-50 to test
- Only increase after you understand everything
- Remember: You can lose money!

#### 2. Test with "Dry Run" Mode

Many examples support dry-run (simulation mode):
```typescript
const subscription = await sdk.smartMoney.startAutoCopyTrading({
  dryRun: true,  // Simulate trades, don't actually place them
  // ... other options
});
```

**Always test with dryRun first!**

#### 3. Understand What You're Running

- Read the code before running
- Understand what each example does
- Ask questions if something is unclear

#### 4. Monitor Your Bot

- Don't run a bot unattended for days
- Check on it regularly (every few hours)
- Watch for unusual behavior
- Stop if something seems wrong

#### 5. Set Loss Limits

```typescript
// Example: Stop trading if losing more than $100
const MAX_LOSS = 100;
let totalPnL = 0;

// In your trading logic...
if (totalPnL < -MAX_LOSS) {
  console.log('Loss limit reached - stopping!');
  process.exit(1);
}
```

#### 6. Keep Your Private Key Secure

- **Never share your private key**
- **Never put it in code files**
- **Never commit to GitHub**
- Use environment variables only
- Consider hardware wallets for large amounts

#### 7. Be Aware of Risks

**You can lose money because of**:
- Bugs in the bot (software isn't perfect)
- Network issues (transactions fail)
- Market manipulation (price spikes)
- Your own mistakes (wrong configuration)
- Smart contract vulnerabilities (rare but possible)

**Polymarket risks**:
- Prediction markets are gambling-like
- You might lose your entire position
- Markets can resolve unexpectedly
- Liquidity can dry up (hard to sell)

**Never trade money you can't afford to lose!**

---

## Customizing the Bot

### 🎯 Common Customizations

#### 1. Change Profit Threshold

In arbitrage examples, change the minimum profit:

```typescript
// Original: 0.1% profit threshold
const arb = await sdk.detectArbitrage(conditionId, 0.001);

// Change to: 0.5% profit threshold
const arb = await sdk.detectArbitrage(conditionId, 0.005);
```

#### 2. Adjust Trade Size

```typescript
const subscription = await sdk.smartMoney.startAutoCopyTrading({
  sizeScale: 0.1,      // Copy 10% of smart money trades
  maxSizePerTrade: 10,   // Max $10 per trade
  minTradeSize: 5,       // Only copy trades > $5
});
```

#### 3. Filter by Specific Traders

```typescript
const subscription = await sdk.smartMoney.startAutoCopyTrading({
  targetAddresses: [
    '0x123...',  // Copy only these specific wallets
    '0x456...',
  ],
});
```

#### 4. Change Scan Interval

```typescript
// Scan for arbitrage every 5 seconds
setInterval(async () => {
  await scanForArbitrage();
}, 5000);
```

#### 5. Add Notifications

```typescript
// Email notification on trade (using nodemailer)
import nodemailer from 'nodemailer';

async function sendEmail(subject: string, body: string) {
  const transporter = nodemailer.createTransport({
    // Your email config
  });

  await transporter.sendMail({ subject, text: body });
}

// Call when trade executes
await sendEmail('Trade Executed', `Bought YES @ $0.45`);
```

---

## Troubleshooting Common Issues

### ❌ Issue: "Module not found" Error

**Symptom**:
```
Error: Cannot find module '@catalyst-team/poly-sdk'
```

**Solution**:
```bash
# Rebuild the project
npm run build

# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

---

### ❌ Issue: "Private key not found" Error

**Symptom**:
```
Error: POLYMARKET_PRIVATE_KEY is not defined
```

**Solution**:
1. Check your `.env` file exists
2. Verify the variable name is correct: `POLYMARKET_PRIVATE_KEY`
3. Make sure `.env` is in the same folder as your script
4. Try restarting your terminal

---

### ❌ Issue: "Insufficient funds" Error

**Symptom**:
```
Error: Insufficient balance for transaction
```

**Solution**:
1. Check you have enough USDC on Polygon
2. Check you have enough MATIC for gas fees
3. Verify your wallet address is correct
4. Check if tokens are on the right network (Polygon, not Ethereum)

---

### ❌ Issue: "Rate limit exceeded" Error

**Symptom**:
```
Error: 429 Too Many Requests
```

**Solution**:
1. Wait a few minutes and retry
2. Reduce how often you poll APIs
3. Use WebSocket subscriptions instead of polling
4. The bot has built-in rate limiting - make sure you're using it

---

### ❌ Issue: WebSocket connection fails

**Symptom**:
```
Error: WebSocket connection failed
```

**Solution**:
1. Check your internet connection
2. Verify firewall isn't blocking WebSocket connections
3. Try again after a few seconds (auto-reconnect should handle this)
4. Check if Polymarket services are down (rare)

---

### ❌ Issue: Build fails with TypeScript errors

**Symptom**:
```
error TS2307: Cannot find module '...'
```

**Solution**:
1. Make sure you ran `npm install`
2. Check Node.js version is 18+
3. Try deleting `node_modules` and reinstalling
4. Verify all source files are present

---

## Next Steps

### 🎓 Learning Path

**Level 1: Understanding (1-2 hours)**
- ✅ Run all example scripts
- ✅ Read the code and understand what it does
- ✅ Use Polymarket UI to see markets live

**Level 2: Testing (1 day)**
- ✅ Set up small test wallet ($10-50)
- ✅ Run examples with real data (read-only)
- ✅ Place a few small manual trades to understand

**Level 3: Customizing (1 week)**
- ✅ Modify examples to fit your strategy
- ✅ Create your own simple bot
- ✅ Test with dry-run mode extensively

**Level 4: Production (ongoing)**
- ✅ Deploy a robust bot with safety features
- ✅ Monitor and adjust over time
- ✅ Keep learning and improving

### 📚 Additional Resources

**Official Documentation**:
- Polymarket Developer Docs: https://docs.polymarket.com
- This Project's README: `README.md`
- Detailed Docs: `docs/` folder

**Community**:
- Polymarket Discord: https://discord.gg/polymarket
- GitHub Issues: https://github.com/cyl19970726/poly-sdk/issues

**Learning Resources**:
- JavaScript/TypeScript: https://javascript.info/
- Blockchain Basics: https://ethereum.org/en/developers/
- Trading Strategies: Research online (be careful, lots of scams!)

### 💡 Ideas for Your First Bot

1. **Simple Arbitrage Scanner**
   - Scan markets every 30 seconds
   - Find YES+NO < $0.99
   - Send yourself email alerts

2. **Smart Money Follower**
   - Follow top 5 traders
   - Copy their BUY orders (small size)
   - Don't copy SELL orders

3. **Market Maker**
   - Place orders on both sides of a market
   - Keep narrow spreads
   - Earn rewards (if available)
   - Update orders every minute

4. **Trend Follower**
   - Track 1-hour K-lines
   - If price goes up 5%, buy YES
   - If price goes down 5%, buy NO
   - Set stop-loss at 10%

---

## 🎉 Congratulations!

You now have:
- ✅ A working Polymarket trading bot installation
- ✅ Understanding of how it works
- ✅ 13 example scripts to learn from
- ✅ Knowledge to customize it
- ✅ Safety awareness

**Remember**:
- Start small and test thoroughly
- Never trade money you can't afford to lose
- Keep learning and improving
- Ask questions when unsure

**Good luck and trade responsibly! 🚀**

---

## 🔧 Known Issues & Fixes

### ⚠️ Method Name Changes in Examples

**Issue**: Some examples use outdated method names

**Example 02-smart-money.ts was calling:**
```typescript
// WRONG - This method doesn't exist
const leaderboard = await sdk.dataApi\.fetchLeaderboard({ limit: 10 });
```

**Fixed to:**
```typescript
// CORRECT - Use fetchLeaderboard instead
const leaderboard = await sdk.dataApi.fetchLeaderboard({ limit: 10 });
```

**All examples in this folder have been fixed to use correct method names.**

---

## 📞 Need Help?

If you run into issues:

1. **Check the troubleshooting section** above
2. **Read the README.md** file in this folder
3. **Check the examples** - they show working code
4. **Search GitHub issues** for similar problems
5. **Ask in Polymarket Discord**

**When asking for help, provide**:
- Your operating system (Windows/Mac/Linux)
- Node.js version (`node --version`)
- The exact error message
- What you were trying to do
- Steps you've already tried

---

**Last updated**: January 10, 2026

**Version**: @catalyst-team/poly-sdk v0.4.3

**Happy Trading! 📈💰**

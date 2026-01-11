# 🤖 Polymarket Trading Bot - Complete Setup Guide

**The Ultimate Open-Source Automated Trading Bot for Polymarket**

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![Arabic](https://img.shields.io/badge/Language-Arabic-green)](README_AR.md)

**Created by**: [@Mr_CryptoYT](https://x.com/Mr_CryptoYT)

This guide will take you **from A to Z** on how to set up, configure, and run your own trading bot. No prior experience required.

---

## 📋 Table of Contents

1.  [Prerequisites](#prerequisites)
2.  [Installation](#installation)
3.  [Configuration (The Key Step)](#configuration)
4.  [Running the Bot](#running-the-bot)
5.  [Dashboard Guide](#dashboard-guide)
6.  [Strategies Explained](#strategies-explained)
7.  [Troubleshooting](#troubleshooting)
8.  [Safety & Risks](#safety--risks)

---

## 1. Prerequisites

Before you start, you need three things:

### 💻 Computer Requirements
*   **OS**: Windows, Mac, or Linux.
*   **Node.js**: You must have Node.js installed (Version 18 or higher).
    *   [Download Node.js here](https://nodejs.org/) (Choose "LTS" version).
*   **Git**: Required to download the code.
    *   [Download Git here](https://git-scm.com/).

### 💰 Wallet Requirements
*   **A Polymarket Account**: Log in to [Polymarket.com](https://polymarket.com).
*   **USDC (Polygon)**: You need funds to trade.
    *   **USDC.e** is the specific token used on Polygon for Polymarket.
*   **MATIC (Polygon)**: You need a small amount ($1-$5) for gas fees.

### 🔑 Private Key
*   You need the **Private Key** of your wallet (e.g., from MetaMask or your Polymarket proxy wallet).
*   *Security Note: Never share this key with anyone.*

---

## 2. Installation

Open your terminal (Command Prompt or PowerShell on Windows, Terminal on Mac) and run these commands one by one.

### Step 1: Clone the Repository
Download the bot code to your computer.

```bash
git clone https://github.com/MrFadiAi/Polymarket-bot.git
cd Polymarket-bot
```

*(Note: If you downloaded the ZIP file instead, just unzip it and open the folder in your terminal)*

### Step 2: Install Dependencies
This installs all the "parts" the bot needs to run.

```bash
npm install
```

*This process might take 1-3 minutes.*

---

## 3. Configuration

This is the most important step. We need to tell the bot your wallet details.

### Step 1: Create the .env File
1.  Find the file named `.env.example` in the folder.
2.  Copy it and rename the copy to `.env`.

### Step 2: Add Your Credentials
Open the `.env` file with any text editor (Notepad, VS Code) and fill in your details:

```env
# ==============================================
# 🔑 WALLET CONFIGURATION (REQUIRED)
# ==============================================

# Your Wallet Private Key (Export from MetaMask)
# Format: 0x...
POLYMARKET_PRIVATE_KEY=0xYourPrivateKeyHere

# ==============================================
# ⚙️ BOT SETTINGS
# ==============================================

# DRY RUN MODE
# "true" = Simulation Mode (No real money used, SAFE to test)
# "false" = Live Trading (Real money used, BE CAREFUL)
DRY_RUN=true

# API Keys (Optional but recommended for speed)
# Get a free key from specific providers if you want better performance
# ALCHEMY_KEY=...
```

**⚠️ IMPORTANT:** Start with `DRY_RUN=true`. Only change it to `false` when you are 100% sure everything works.

---

## 4. Running the Bot

Now the fun part! Let's start the bot with the visual dashboard.

Run this command:

```bash
npx tsx bot-with-dashboard.ts
```

### What happens next?
1.  The terminal will show startup logs.
2.  It will verify your wallet connection.
3.  **The Dashboard will open automatically in your browser** at `http://localhost:3001`.

If it doesn't open, just click that link.

---

## 5. Dashboard Guide

The dashboard is your command center.

*   **Mode Indicator**: Shows if you are in **🔴 LIVE** or **🟢 DRY RUN** mode.
*   **Balances**: Reat-time view of your MATIC and USDC.
*   **PnL Panel**: Tracks your Profit and Loss per session.
*   **Quick Actions**: Buttons to instantly stop strategies or panic sell.

---

## 6. Strategies Explained

The bot comes with 4 powerful strategies. You can toggle them ON/OFF in the dashboard.

### 1. ⚖️ Arbitrage
*   **Concept**: Finds markets where `YES Price + NO Price < $1.00`.
*   **Action**: Buys both sides immediately.
*   **Profit**: Guaranteed math-based profit when the market resolves to $1.00.
*   **Risk**: Extremely Low.

### 2. 📉 DipArb (Dip Arbitrage)
*   **Concept**: Watches for panic selling in 15-minute crypto markets (BTC, ETH).
*   **Trigger**: If price crashes >15% in 3 seconds.
*   **Action**: Buys the dip (Leg 1) and hedges with the opposite side (Leg 2).

### 3. 🐋 Smart Money
*   **Concept**: Tracks the top profitable traders on the leaderboard.
*   **Action**: Copies their trades automatically.
*   **Settings**: You can configure how much to copy relative to their size.

### 4. ⚡ Direct Trading
*   **Concept**: Tools for manual trading with super-powers.
*   **Features**:
    *   **FOK (Fill or Kill)**: Ensures your whole order fills or cancels (no partial fills).
    *   **Sniper**: Quick buy buttons slightly above market price to ensure entry.

---

## 7. Troubleshooting

**"Command not found" error?**
*   Make sure you installed Node.js. Restart your computer if you just installed it.

**"Connection Failed"?**
*   Check your internet.
*   Verify your `POLYMARKET_PRIVATE_KEY` is correct in `.env`.

**"Insufficient Funds"?**
*   You need both USDC (for trades) and MATIC (for gas) on the **Polygon Network**.

---

## 8. Safety & Risks

1.  **Private Keys**: Your key gives full access to your funds. Keep it safe.
2.  **Start Small**: Use Dry Run first. Then try with small amounts ($10-$50).
3.  **Monitor**: Do not leave the bot running unmonitored for days until you trust it.

---

**Original SDK Documentation**: For developers who want to use the raw SDK, see [SDK_DOCUMENTATION.md](SDK_DOCUMENTATION.md).

**Created by**: [@Mr_CryptoYT](https://x.com/Mr_CryptoYT)

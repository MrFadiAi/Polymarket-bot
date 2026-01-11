# Polymarket Bot Dashboard

A real-time monitoring UI for your Polymarket trading bot.

![Dashboard Screenshot](./dashboard-preview.png)

## Features

- **Real-time Updates** - WebSocket connection for instant state changes
- **Balance Monitoring** - MATIC, USDC, USDC.e balances
- **P&L Tracking** - Daily/Total P&L with color-coded indicators
- **Strategy Overview** - Trade counts and status for all 4 strategies
- **Market Trends** - BTC/ETH/SOL trend indicators from Binance analysis
- **On-Chain Stats** - Splits, merges, redeems, and swaps counter
- **Activity Log** - Filterable log viewer with expandable details
- **Wallet List** - Followed wallets with Polygonscan links
- **Configuration Panel** - Collapsible view of all bot settings

## Quick Start

### 1. Install Dashboard Dependencies

```bash
cd dashboard
npm install
```

### 2. Run the Bot with Dashboard

```bash
npx tsx bot-with-dashboard.ts
```

### 3. Start the Dashboard UI

In a new terminal:

```bash
cd dashboard
npm run dev
```

### 4. Open in Browser

Navigate to: **http://localhost:5173**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React)                          │
│              http://localhost:5173                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket (real-time)
                          │ ws://localhost:3001
┌─────────────────────────┴───────────────────────────────────┐
│                  Dashboard Server (Node.js)                  │
│              http://localhost:3001/api/*                     │
└─────────────────────────┬───────────────────────────────────┘
                          │ Event Emitter
┌─────────────────────────┴───────────────────────────────────┐
│                  Bot (bot-with-dashboard.ts)                 │
│              dashboardEmitter.updateState()                  │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Full state, config, and logs |
| `GET /api/state` | Current bot state only |
| `GET /api/config` | Bot configuration |
| `GET /api/logs` | Activity log buffer |
| `GET /health` | Health check |

## WebSocket Messages

The dashboard connects to `ws://localhost:3001` and receives:

```typescript
// On connect - full data
{ type: 'full', payload: { state, config, logs } }

// State updates
{ type: 'state', payload: BotState }

// New log entries
{ type: 'log', payload: LogEntry }

// Config changes
{ type: 'config', payload: BotConfig }
```

## Integrating with Your Own Bot

If you want to add the dashboard to your existing bot code:

### 1. Import the dashboard

```typescript
import { startDashboard, dashboardEmitter } from './src/dashboard/index.js';
```

### 2. Start the server

```typescript
startDashboard(3001);
```

### 3. Send state updates

```typescript
// Update full state
dashboardEmitter.updateState(state);

// Send config once at startup
dashboardEmitter.updateConfig(config);

// Send logs
dashboardEmitter.log('TRADE', 'Bought YES token', { price: 0.45 });
```

### 4. Replace your log function

```typescript
function log(level: LogLevel, message: string, data?: unknown) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  dashboardEmitter.log(level, message, data);
}
```

## File Structure

```
├── src/dashboard/
│   ├── index.ts          # Exports
│   ├── server.ts         # Express + WebSocket server
│   ├── state-emitter.ts  # Event emitter for state
│   └── types.ts          # TypeScript types
│
├── dashboard/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       ├── types.ts
│       ├── hooks/
│       │   └── useWebSocket.ts
│       └── components/
│           ├── Header.tsx
│           ├── BalanceCards.tsx
│           ├── PnLPanel.tsx
│           ├── TrendIndicators.tsx
│           ├── StrategyGrid.tsx
│           ├── OnChainStats.tsx
│           ├── ActivityLog.tsx
│           ├── WalletList.tsx
│           ├── ConfigPanel.tsx
│           └── ConnectionStatus.tsx
│
└── bot-with-dashboard.ts   # Bot entry point with dashboard
```

## Development

### Run frontend in dev mode

```bash
cd dashboard
npm run dev
```

### Build for production

```bash
cd dashboard
npm run build
```

The build output will be in `dashboard/dist/`.

## Troubleshooting

### Dashboard shows "Connecting..."

- Make sure the bot is running: `npx tsx bot-with-dashboard.ts`
- Check that port 3001 is not in use
- Look for errors in the bot console

### State not updating

- Check WebSocket connection in browser DevTools → Network → WS
- Ensure `dashboardEmitter.updateState()` is being called

### CORS errors

- The server includes CORS headers by default
- If using a different port, update the proxy in `vite.config.ts`

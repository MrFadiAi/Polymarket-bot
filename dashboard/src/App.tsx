import { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import {
  Header,
  BalanceCards,
  PnLPanel,
  TrendIndicators,
  StrategyGrid,
  OnChainStats,
  ActivityLog,
  ConfigPanel,
  ConnectionStatus,
  DipArbPanel,
  ArbitragePanel,
  SmartMoneyPanel,
  QuickStats,
  SessionSummary,
  HistoryPage,
  PositionsPage,
  StrategyControls,
} from './components';

type Page = 'dashboard' | 'history' | 'positions';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const { state, config, logs, connected, error, sendCommand } = useWebSocket();
  const isDryRun = config?.dryRun ?? true;

  const handleClosePosition = (tokenId: string, size: number) => {
    sendCommand('closePosition', { tokenId, size });
  };

  const handleToggleStrategy = (strategy: string, enabled: boolean) => {
    sendCommand('toggleStrategy', { strategy, enabled });
  };

  const handleRedeemPosition = (conditionId: string) => {
    sendCommand('redeemPosition', { conditionId });
  };

  // Backend semantics (v3.2): payload.enabled is the TARGET dryRun state,
  // so toggling sends !isDryRun (true = stay/go dry-run, false = go LIVE).
  const handleToggleDryRun = () => {
    if (isDryRun) {
      const confirmed = window.confirm('⚠️ WARNING: You are switching to LIVE trading mode.\n\nReal funds will be used. Ensure you have loaded your Private Key and understand the risks.\n\nContinue?');
      if (!confirmed) return;
    }
    sendCommand('toggleDryRun', { enabled: !isDryRun });
  };

  const handleEmergencyStop = () => {
    if (window.confirm('🛑 EMERGENCY STOP?\n\nHalts all strategies immediately. Restart the bot to resume.')) {
      sendCommand('emergencyStop', {});
    }
  };

  const handlePanicSell = () => {
    if (!window.confirm('🚨 PANIC SELL?\n\nThis closes up to 10 open positions at market price.')) return;
    if (window.confirm('Last confirmation: real market orders will be placed. Continue?')) {
      sendCommand('panicSell', {});
    }
  };

  // History page
  if (currentPage === 'history') {
    return <HistoryPage onBack={() => setCurrentPage('dashboard')} />;
  }

  // Positions page
  if (currentPage === 'positions') {
    return (
      <PositionsPage
        onBack={() => setCurrentPage('dashboard')}
        state={state}
        onClosePosition={handleClosePosition}
        onRedeemPosition={handleRedeemPosition}
      />
    );
  }

  // Main dashboard - Compact trading-focused layout
  return (
    <div className={`min-h-screen bg-poly-dark text-white ${isDryRun ? 'dry-run-breathing' : 'live-mode-breathing'}`}>
      {/* Mode Banner - Compact */}
      <div className={`${isDryRun ? 'bg-red-500/20 border-red-500/30' : 'bg-green-500/20 border-green-500/30'} border-b px-4 py-1.5 text-center`}>
        <span className={`${isDryRun ? 'text-red-400' : 'text-green-400'} font-medium text-xs flex items-center justify-center gap-2`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isDryRun ? 'bg-red-400' : 'bg-green-400'} animate-pulse`} />
          {isDryRun ? 'DRY RUN — No real trades' : 'LIVE — Real money trading'}
        </span>
      </div>

      {/* Connection Status */}
      <ConnectionStatus connected={connected} error={error} />

      {/* Header */}
      <Header
        state={state}
        config={config}
        connected={connected}
        onHistoryClick={() => setCurrentPage('history')}
        onPositionsClick={() => setCurrentPage('positions')}
        onToggleDryRun={handleToggleDryRun}
      />

      <main className="p-4 space-y-4 max-w-[1800px] mx-auto">
        {/* Row 1: Quick Stats + Balances side by side */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <QuickStats state={state} config={config} />
          <BalanceCards state={state} />
        </div>

        {/* Row 2: Main Trading Grid - 4 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <DipArbPanel state={state} />
          <ArbitragePanel state={state} />
          <PnLPanel state={state} config={config} />
          <SessionSummary state={state} />
        </div>

        {/* Row 3: Smart Money (main) + Side Panel (Trends + Strategies + OnChain) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SmartMoneyPanel state={state} />
          </div>
          <div className="space-y-3">
            <StrategyControls
              config={config}
              onToggle={handleToggleStrategy}
              onEmergencyStop={handleEmergencyStop}
              onPanicSell={handlePanicSell}
            />
            <TrendIndicators state={state} />
            <StrategyGrid state={state} config={config} />
            <OnChainStats state={state} />
          </div>
        </div>

        {/* Row 4: Activity Log - Full Width at bottom */}
        <ActivityLog logs={logs} />

        {/* Config - Collapsible at bottom */}
        <details className="group">
          <summary className="cursor-pointer text-gray-500 text-sm hover:text-gray-400 flex items-center gap-2 py-2">
            <span className="transition-transform group-open:rotate-90">▶</span>
            Advanced Configuration
          </summary>
          <div className="mt-2">
            <ConfigPanel config={config} />
          </div>
        </details>
      </main>

      {/* Minimal Footer */}
      <footer className="text-center py-3 border-t border-white/5 text-gray-600 text-xs">
        <div className="flex flex-col gap-1">
          <div>Polymarket Bot v3.2 • {connected ? '🟢 Connected' : '🔴 Disconnected'}</div>
          <div>
            Created by <a href="https://x.com/Mr_CryptoYT" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">@Mr_CryptoYT</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

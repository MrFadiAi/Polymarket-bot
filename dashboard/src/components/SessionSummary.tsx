import type { BotState } from '../types';

interface SessionSummaryProps {
  state: BotState | null;
}

export function SessionSummary({ state }: SessionSummaryProps) {
  const trades = state?.tradesExecuted ?? 0;
  const totalPnL = state?.totalPnL ?? 0;
  const avgProfit = trades > 0 ? totalPnL / trades : 0;
  
  // Calculate estimated wins/losses based on P&L
  const estimatedWins = trades > 0 ? Math.round(trades * 0.5 + (totalPnL > 0 ? totalPnL / 10 : totalPnL / 20)) : 0;
  const wins = Math.max(0, Math.min(trades, estimatedWins));
  const losses = Math.max(0, trades - wins);
  const winRate = trades > 0 ? (wins / trades) * 100 : 0;

  const arbProfit = state?.arbProfit ?? 0;
  const smartMoneyTrades = state?.smartMoneyTrades ?? 0;
  const dipArbTrades = state?.dipArbTrades ?? 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-purple-500/20 to-blue-500/20">
            📊
          </div>
          Session Summary
        </h2>
      </div>

      <div className="panel-body">
        {/* Win/Loss Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold font-mono text-green-400 glow-text-green">
              {wins}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Wins</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold font-mono text-red-400">
              {losses}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Losses</div>
          </div>
          <div className="text-center">
            <div className={`text-3xl font-bold font-mono ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {winRate.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Win Rate</div>
          </div>
          <div className="text-center">
            <div className={`text-3xl font-bold font-mono ${avgProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${avgProfit.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Avg/Trade</div>
          </div>
        </div>

        {/* Win Rate Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Win Rate Distribution</span>
            <span>{wins}W - {losses}L</span>
          </div>
          <div className="h-3 rounded-full bg-gray-800 overflow-hidden flex">
            <div 
              className="h-full progress-gradient-green transition-all duration-500"
              style={{ width: `${winRate}%` }}
            />
            <div 
              className="h-full progress-gradient-red transition-all duration-500"
              style={{ width: `${100 - winRate}%` }}
            />
          </div>
        </div>

        <div className="divider" />

        {/* Strategy Breakdown */}
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Profit by Strategy
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-gray-300">Arbitrage</span>
            </div>
            <span className={`font-mono font-medium ${arbProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {arbProfit >= 0 ? '+' : ''}{arbProfit.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-gray-300">Smart Money</span>
            </div>
            <span className="font-mono text-gray-400">{smartMoneyTrades} trades</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-gray-300">DipArb</span>
            </div>
            <span className="font-mono text-gray-400">{dipArbTrades} trades</span>
          </div>
        </div>
      </div>
    </div>
  );
}

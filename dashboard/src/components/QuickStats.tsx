import type { BotState, BotConfig } from '../types';

interface QuickStatsProps {
  state: BotState | null;
  config: BotConfig | null;
}

export function QuickStats({ state, config }: QuickStatsProps) {
  const realizedPnL = state?.totalPnL ?? 0;
  const unrealizedPnL = state?.unrealizedPnL ?? 0;
  // Total for display includes unrealized gains/losses
  const totalPnL = realizedPnL + unrealizedPnL;

  const dailyPnL = state?.dailyPnL ?? 0;
  const trades = state?.tradesExecuted ?? 0;
  const activeStrategies = [
    config?.smartMoney?.enabled,
    config?.arbitrage?.enabled,
    config?.dipArb?.enabled,
    config?.directTrading?.enabled,
  ].filter(Boolean).length;

  const winRate = trades > 0 ? Math.min(100, Math.max(0, 50 + (realizedPnL / (trades * 2)))) : 0;

  const formatPnL = (value: number) => {
    const formatted = Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  };

  return (
    <div className="glass-card rounded-2xl p-1">
      <div className="flex items-center justify-between gap-2 px-2">
        {/* Total P&L */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className={`icon-circle-sm ${totalPnL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {totalPnL >= 0 ? '📈' : '📉'}
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Total P&L</div>
            <div className={`text-lg font-bold font-mono ${totalPnL >= 0 ? 'text-green-400 glow-text-green' : 'text-red-400 glow-text-red'}`}>
              {formatPnL(totalPnL)}
              {unrealizedPnL !== 0 && (
                <span className="text-xs text-gray-500 ml-1 block font-normal">
                  ({unrealizedPnL >= 0 ? '+' : ''}{unrealizedPnL.toFixed(2)} Open)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="w-px h-10 bg-white/10" />

        {/* Daily P&L */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className={`icon-circle-sm ${dailyPnL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {dailyPnL >= 0 ? '☀️' : '🌙'}
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Today</div>
            <div className={`text-lg font-bold font-mono ${dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPnL(dailyPnL)}
            </div>
          </div>
        </div>

        <div className="w-px h-10 bg-white/10" />

        {/* Win Rate */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="icon-circle-sm bg-purple-500/20">🎯</div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Win Rate</div>
            <div className="text-lg font-bold font-mono text-purple-400">
              {winRate.toFixed(0)}%
            </div>
          </div>
        </div>

        <div className="w-px h-10 bg-white/10" />

        {/* Total Trades */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="icon-circle-sm bg-blue-500/20">💹</div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Trades</div>
            <div className="text-lg font-bold font-mono text-blue-400">{trades}</div>
          </div>
        </div>

        <div className="w-px h-10 bg-white/10" />

        {/* Active Strategies */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="icon-circle-sm bg-yellow-500/20">⚡</div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Active</div>
            <div className="text-lg font-bold font-mono text-yellow-400">
              {activeStrategies}/4
            </div>
          </div>
        </div>

        <div className="w-px h-10 bg-white/10" />

        {/* Opportunities */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="icon-circle-sm bg-cyan-500/20">🔍</div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Found</div>
            <div className="text-lg font-bold font-mono text-cyan-400">
              {state?.arbitrage?.opportunitiesFound ?? 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

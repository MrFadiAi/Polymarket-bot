import type { BotState } from '../types';

interface ArbitragePanelProps {
  state: BotState | null;
}

export function ArbitragePanel({ state }: ArbitragePanelProps) {
  const arb = state?.arbitrage;
  const arbProfit = state?.arbProfit ?? 0;
  const arbTrades = state?.arbTrades ?? 0;

  const getStatusStyle = (status: string | undefined) => {
    switch (status) {
      case 'scanning':
        return { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', icon: '🔍' };
      case 'monitoring':
        return { color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30', icon: '👁️' };
      default:
        return { color: 'text-gray-400', bg: 'bg-gray-500/20', border: 'border-gray-500/30', icon: '⏸️' };
    }
  };

  const statusStyle = getStatusStyle(arb?.status);

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
            🔄
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-blue-400 uppercase tracking-wider font-medium">Strategy 2</span>
            <span>Arbitrage Monitor</span>
          </div>
        </h2>
        <span className={`badge ${statusStyle.bg} ${statusStyle.color} ${statusStyle.border} border flex items-center gap-1.5`}>
          <span>{statusStyle.icon}</span>
          {arb?.status?.toUpperCase() ?? 'IDLE'}
        </span>
      </div>

      <div className="panel-body space-y-5">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-poly-dark/50 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Trades</div>
            <div className="text-3xl font-mono font-bold text-white">{arbTrades}</div>
          </div>
          <div className="bg-poly-dark/50 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Profit</div>
            <div className={`text-3xl font-mono font-bold ${arbProfit >= 0 ? 'text-green-400 glow-text-green' : 'text-red-400'}`}>
              ${arbProfit.toFixed(2)}
            </div>
          </div>
          <div className="bg-poly-dark/50 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Found</div>
            <div className="text-3xl font-mono font-bold text-blue-400">
              {arb?.opportunitiesFound ?? 0}
            </div>
          </div>
        </div>

        {/* Scan Status */}
        <div className="bg-poly-dark/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Scan Progress</span>
            <span className="text-xs text-gray-400 font-mono">
              {arb?.marketsScanned ?? 0} markets
            </span>
          </div>

          {/* Animated scanning bar */}
          {arb?.status === 'scanning' && (
            <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden mb-4">
              <div className="h-full w-1/3 rounded-full progress-gradient-blue animate-pulse shimmer" />
            </div>
          )}

          {arb?.currentMarket ? (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-sm flex-shrink-0">
                👁️
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 mb-1">Currently Monitoring</div>
                <div className="text-sm text-white font-medium truncate" title={arb.currentMarket}>
                  {arb.currentMarket}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-gray-500">
              <div className="w-8 h-8 rounded-lg bg-gray-500/20 flex items-center justify-center text-sm">
                🔍
              </div>
              <span className="text-sm">
                {arb?.status === 'scanning' ? 'Searching for opportunities...' : 'No market selected'}
              </span>
            </div>
          )}
        </div>

        {/* Last Opportunity */}
        {arb?.lastOpportunity ? (
          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-xl p-4 border border-green-500/20">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Last Opportunity
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`badge ${arb.lastOpportunity.type === 'long' ? 'badge-green' : 'badge-red'}`}>
                  {arb.lastOpportunity.type.toUpperCase()}
                </div>
                <span className="text-gray-300 text-sm truncate max-w-[150px]" title={arb.lastOpportunity.market}>
                  {arb.lastOpportunity.market}
                </span>
              </div>
              <div className="text-green-400 font-mono font-bold text-lg glow-text-green">
                +{(arb.lastOpportunity.profitPct * 100).toFixed(2)}%
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-poly-dark/30 rounded-xl p-6 text-center">
            <div className="text-3xl mb-2">💎</div>
            <div className="text-gray-500 text-sm">No opportunities yet</div>
            <div className="text-xs text-gray-600 mt-1">Keep scanning...</div>
          </div>
        )}

        {/* Performance Indicator */}
        {arbTrades > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Avg profit per trade</span>
            <span className={`font-mono font-semibold ${arbProfit / arbTrades >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${(arbProfit / arbTrades).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

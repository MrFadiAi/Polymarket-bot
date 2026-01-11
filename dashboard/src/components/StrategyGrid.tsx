import type { BotState, BotConfig } from '../types';

interface StrategyGridProps {
  state: BotState | null;
  config: BotConfig | null;
}

export function StrategyGrid({ state, config }: StrategyGridProps) {
  const strategies = [
    {
      name: 'Smart Money',
      icon: '👛',
      enabled: config?.smartMoney?.enabled ?? false,
      trades: state?.smartMoneyTrades ?? 0,
      detail: `${state?.followedWallets?.length ?? 0} wallets`,
      color: 'from-pink-500/20 to-purple-500/20',
      badgeColor: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    },
    {
      name: 'Arbitrage',
      icon: '🔄',
      enabled: config?.arbitrage?.enabled ?? false,
      trades: state?.arbTrades ?? 0,
      detail: 'Price gaps',
      color: 'from-blue-500/20 to-cyan-500/20',
      badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    },
    {
      name: 'DipArb',
      icon: '📉',
      enabled: config?.dipArb?.enabled ?? false,
      trades: state?.dipArbTrades ?? 0,
      detail: 'Sum target',
      color: 'from-green-500/20 to-emerald-500/20',
      badgeColor: 'bg-green-500/20 text-green-400 border-green-500/30',
    },
    {
      name: 'Direct',
      icon: '⚡',
      enabled: config?.directTrading?.enabled ?? false,
      trades: state?.directTrades ?? 0,
      detail: 'Trend-based',
      color: 'from-yellow-500/20 to-orange-500/20',
      badgeColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    },
  ];

  const activeCount = strategies.filter(s => s.enabled).length;

  return (
    <div className="glass-card rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <span className="text-sm font-medium text-white">Strategies</span>
        </div>
        <span className="text-[10px] text-gray-500">{activeCount}/4 active</span>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        {strategies.map((s) => (
          <div
            key={s.name}
            className={`p-2.5 rounded-lg bg-gradient-to-br ${s.color} border border-white/5`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-lg">{s.icon}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${s.enabled ? s.badgeColor : 'bg-gray-500/20 text-gray-500 border-gray-500/30'}`}>
                {s.enabled ? '● ON' : 'OFF'}
              </span>
            </div>
            <div className="text-xs font-medium text-white truncate">{s.name}</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg font-bold font-mono text-white">{s.trades}</span>
              <span className="text-[10px] text-gray-500 truncate">{s.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import type { BotState } from '../types';

interface OnChainStatsProps {
  state: BotState | null;
}

export function OnChainStats({ state }: OnChainStatsProps) {
  const splits = state?.splits ?? 0;
  const merges = state?.merges ?? 0;
  const redeems = state?.redeems ?? 0;
  const swaps = state?.swaps ?? 0;
  const total = splits + merges + redeems + swaps;

  const stats = [
    { label: 'Splits', value: splits, color: 'bg-purple-500', icon: '✂️' },
    { label: 'Merges', value: merges, color: 'bg-blue-500', icon: '🔗' },
    { label: 'Redeems', value: redeems, color: 'bg-green-500', icon: '💸' },
    { label: 'Swaps', value: swaps, color: 'bg-yellow-500', icon: '💱' },
  ];

  return (
    <div className="glass-card rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⛓️</span>
          <span className="text-sm font-medium text-white">On-Chain Ops</span>
        </div>
        <span className="text-lg font-bold font-mono text-white">{total}</span>
      </div>

      {/* Compact horizontal bar */}
      <div className="h-2 rounded-full bg-gray-700 overflow-hidden flex mb-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`h-full ${stat.color} transition-all duration-500`}
            style={{ width: total > 0 ? `${(stat.value / total) * 100}%` : '25%' }}
          />
        ))}
      </div>

      {/* Compact grid of stats */}
      <div className="grid grid-cols-4 gap-1">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center p-1.5 rounded bg-poly-dark/50">
            <div className="text-xs mb-0.5">{stat.icon}</div>
            <div className="text-sm font-bold font-mono text-white">{stat.value}</div>
            <div className="text-[9px] text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

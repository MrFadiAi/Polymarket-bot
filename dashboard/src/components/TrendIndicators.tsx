import type { BotState } from '../types';

interface TrendIndicatorsProps {
  state: BotState | null;
}

type Trend = 'up' | 'down' | 'neutral';

export function TrendIndicators({ state }: TrendIndicatorsProps) {
  const getTrendBadge = (t: Trend) => {
    switch (t) {
      case 'up': return { arrow: '↗', class: 'badge-green' };
      case 'down': return { arrow: '↘', class: 'badge-red' };
      default: return { arrow: '→', class: 'bg-gray-500/20 text-gray-400 border border-gray-500/30' };
    }
  };

  const trends = [
    { coin: 'BTC', icon: '₿', trend: state?.btcTrend ?? 'neutral', color: 'bg-orange-500/20' },
    { coin: 'ETH', icon: 'Ξ', trend: state?.ethTrend ?? 'neutral', color: 'bg-blue-500/20' },
    { coin: 'SOL', icon: '◎', trend: state?.solTrend ?? 'neutral', color: 'bg-purple-500/20' },
  ];

  return (
    <div className="glass-card rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-sm font-medium text-white">Market Trends</span>
        </div>
        <span className="text-[10px] text-gray-500">15m K-lines</span>
      </div>
      <div className="flex gap-2">
        {trends.map(({ coin, icon, trend, color }) => {
          const badge = getTrendBadge(trend as Trend);
          return (
            <div key={coin} className="flex-1 flex items-center justify-between p-2 rounded-lg bg-poly-dark/50">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-md ${color} flex items-center justify-center text-xs`}>
                  {icon}
                </div>
                <span className="text-xs font-medium text-white">{coin}</span>
              </div>
              <span className={`badge text-[10px] px-1.5 py-0.5 ${badge.class}`}>
                {badge.arrow} {trend.toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

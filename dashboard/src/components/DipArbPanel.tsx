import { useEffect, useState, useRef } from 'react';
import type { BotState, DipArbSignal } from '../types';
import { Sparkline } from './Sparkline';

interface DipArbPanelProps {
  state: BotState | null;
}

const MAX_PRICE_HISTORY = 30;

export function DipArbPanel({ state }: DipArbPanelProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--');
  const [progress, setProgress] = useState(0);
  const [upPriceHistory, setUpPriceHistory] = useState<number[]>([]);
  const [downPriceHistory, setDownPriceHistory] = useState<number[]>([]);
  const lastMarketRef = useRef<string | null>(null);
  const dipArb = state?.dipArb;

  // Track price history
  useEffect(() => {
    if (!dipArb?.marketName) return;

    // Reset history when market changes
    if (lastMarketRef.current !== dipArb.marketName) {
      setUpPriceHistory([]);
      setDownPriceHistory([]);
      lastMarketRef.current = dipArb.marketName;
    }

    // Add new prices if they're valid
    if (dipArb.upPrice > 0) {
      setUpPriceHistory(prev => {
        const newHistory = [...prev, dipArb.upPrice];
        return newHistory.slice(-MAX_PRICE_HISTORY);
      });
    }
    if (dipArb.downPrice > 0) {
      setDownPriceHistory(prev => {
        const newHistory = [...prev, dipArb.downPrice];
        return newHistory.slice(-MAX_PRICE_HISTORY);
      });
    }
  }, [dipArb?.upPrice, dipArb?.downPrice, dipArb?.marketName]);

  useEffect(() => {
    if (!dipArb?.endTime) {
      setTimeRemaining('--:--');
      setProgress(0);
      return;
    }

    const updateTime = () => {
      const now = Date.now();
      const remaining = Math.max(0, dipArb.endTime! - now);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);

      // Calculate progress dynamically based on market duration
      let durationMs = 15 * 60 * 1000; // default 15m
      if (dipArb.duration) {
        const match = dipArb.duration.match(/(\d+)m/);
        if (match && match[1]) {
          durationMs = parseInt(match[1]) * 60 * 1000;
        }
      }

      const elapsed = durationMs - remaining;
      setProgress(Math.min(100, (elapsed / durationMs) * 100));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [dipArb?.endTime]);

  const getSignalStyle = (type: DipArbSignal['type']) => {
    switch (type) {
      case 'dip':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'surge':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'leg1':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'leg2':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      default:
        return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
    }
  };

  const getSumStatus = (sum: number) => {
    if (sum <= 0.92) return { color: 'text-green-400', bg: 'bg-green-500', label: '🎯 Opportunity!' };
    if (sum <= 0.98) return { color: 'text-yellow-400', bg: 'bg-yellow-500', label: 'Close' };
    return { color: 'text-gray-400', bg: 'bg-gray-500', label: 'Normal' };
  };

  const sumStatus = getSumStatus(dipArb?.sum ?? 1);

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-green-500/20 to-emerald-500/20">
            📉
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-green-400 uppercase tracking-wider font-medium">Strategy 3</span>
            <span>DipArb Monitor</span>
          </div>
        </h2>
        {(dipArb?.status === 'active' || dipArb?.marketName) ? (
          <span className="badge badge-green animate-pulse">
            ● LIVE
          </span>
        ) : (
          <span className="badge bg-gray-500/20 text-gray-400 border border-gray-500/30">
            IDLE
          </span>
        )}
      </div>

      <div className="panel-body space-y-5">
        {/* Market Info */}
        {(dipArb?.status === 'active' || dipArb?.marketName) ? (
          <>
            <div className="bg-poly-dark/50 rounded-xl p-4">
              <div className="text-sm text-white font-medium mb-2 truncate" title={dipArb.marketName || ''}>
                {dipArb.marketName}
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Asset:</span>
                  <span className="badge badge-purple">{dipArb.underlying}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Duration:</span>
                  <span className="text-white font-medium">{dipArb.duration}</span>
                </div>
              </div>

              {/* Time Progress */}
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Time Remaining</span>
                  <span className="text-yellow-400 font-mono font-bold">{timeRemaining}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full progress-gradient-yellow transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Live Prices */}
            <div className="bg-poly-dark/50 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-4">Live Orderbook</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-2 flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    UP
                  </div>
                  <div className="text-3xl font-mono font-bold text-green-400 glow-text-green">
                    {(dipArb?.upPrice ?? 0).toFixed(3)}
                  </div>
                  {upPriceHistory.length > 1 && (
                    <div className="mt-2 flex justify-center">
                      <Sparkline data={upPriceHistory} width={80} height={24} color="green" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-2 flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    DOWN
                  </div>
                  <div className="text-3xl font-mono font-bold text-red-400 glow-text-red">
                    {(dipArb?.downPrice ?? 0).toFixed(3)}
                  </div>
                  {downPriceHistory.length > 1 && (
                    <div className="mt-2 flex justify-center">
                      <Sparkline data={downPriceHistory} width={80} height={24} color="red" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-2 flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    SUM
                  </div>
                  <div className={`text-3xl font-mono font-bold ${sumStatus.color}`}>
                    {(dipArb?.sum ?? 0).toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Sum Target Meter */}
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-500">Target: ≤0.92</span>
                  <span className={sumStatus.color}>{sumStatus.label}</span>
                </div>
                <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden relative">
                  {/* Target marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10"
                    style={{ left: '83.6%' }}
                  />
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${sumStatus.bg}`}
                    style={{ width: `${Math.min(100, ((dipArb?.sum ?? 0) / 1.1) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.80</span>
                  <span>0.92</span>
                  <span>1.10</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-poly-dark/50 rounded-xl p-8 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-gray-400">No active market</div>
            <div className="text-xs text-gray-500 mt-1">Waiting for next rotation...</div>
          </div>
        )}

        {/* Recent Signals */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>Recent Signals</span>
            <span className="text-gray-600">{dipArb?.signals?.length ?? 0} total</span>
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto">
            {(dipArb?.signals ?? []).length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-4 bg-poly-dark/30 rounded-lg">
                Waiting for signals...
              </div>
            ) : (
              dipArb?.signals.slice(0, 5).map((signal) => (
                <div
                  key={signal.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${getSignalStyle(signal.type)}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold uppercase text-xs">{signal.type}</span>
                    <span className="text-gray-300">{signal.side}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-gray-400">@{signal.price.toFixed(3)}</span>
                    <span className={signal.change > 0 ? 'text-green-400' : 'text-red-400'}>
                      {signal.change > 0 ? '+' : ''}{signal.change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

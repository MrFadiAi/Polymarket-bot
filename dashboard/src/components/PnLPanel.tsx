import { useState, useEffect } from 'react';
import type { BotState, BotConfig } from '../types';
import { Sparkline } from './Sparkline';
import { AnimatedCounter } from './AnimatedCounter';

interface PnLPanelProps {
  state: BotState | null;
  config: BotConfig | null;
}

const MAX_PNL_HISTORY = 30;

export function PnLPanel({ state, config }: PnLPanelProps) {
  const [pnlHistory, setPnlHistory] = useState<number[]>([]);

  const daily = state?.dailyPnL ?? 0;
  const realized = state?.totalPnL ?? 0;
  const unrealized = state?.unrealizedPnL ?? 0;
  const total = realized + unrealized;

  const arb = state?.arbProfit ?? 0;
  const consecutiveLosses = state?.consecutiveLosses ?? 0;
  const maxLosses = config?.risk?.maxConsecutiveLosses ?? 6;

  // Track P&L history for sparkline
  useEffect(() => {
    setPnlHistory(prev => {
      const newHistory = [...prev, total];
      return newHistory.slice(-MAX_PNL_HISTORY);
    });
  }, [total]);

  const riskLevel = consecutiveLosses / maxLosses;
  const riskColor = riskLevel >= 0.8 ? 'red' : riskLevel >= 0.5 ? 'yellow' : 'green';

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-green-500/20 to-emerald-500/20">
            📈
          </div>
          Profit & Loss
        </h2>
        <div className={`badge ${total >= 0 ? 'badge-green' : 'badge-red'}`}>
          {total >= 0 ? 'Profitable' : 'In Loss'}
        </div>
      </div>

      <div className="panel-body space-y-5">
        {/* Main P&L Display */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total P&L (Live)</div>
            <div className={`text-4xl font-bold ${total > 0 ? 'glow-text-green' : total < 0 ? 'glow-text-red' : ''}`}>
              <AnimatedCounter
                value={total}
                colorize
                prefix="$"
                decimals={2}
                className="text-4xl font-bold"
              />
              {unrealized !== 0 && (
                <div className="text-sm font-normal text-gray-500 mt-1">
                  Realized: ${realized.toFixed(2)} | Open: ${unrealized.toFixed(2)}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Today</div>
            <div>
              <AnimatedCounter
                value={daily}
                colorize
                prefix="$"
                decimals={2}
                className="text-2xl font-bold"
              />
            </div>
          </div>
        </div>

        {/* Sparkline */}
        {pnlHistory.length > 1 && (
          <div className="bg-poly-dark/50 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Performance</div>
            <Sparkline
              data={pnlHistory}
              width={280}
              height={48}
              color={total >= 0 ? 'green' : 'red'}
            />
          </div>
        )}

        <div className="divider" />

        {/* Arbitrage Profit */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="icon-circle-sm bg-blue-500/20">🔄</div>
            <span className="text-gray-400">Arbitrage Profit</span>
          </div>
          <AnimatedCounter
            value={arb}
            colorize
            prefix="$"
            decimals={2}
            className="text-lg font-semibold"
          />
        </div>

        <div className="divider" />

        {/* Risk Meter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Consecutive Losses</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono font-semibold ${riskColor === 'red' ? 'text-red-400' : riskColor === 'yellow' ? 'text-yellow-400' : 'text-green-400'}`}>
                {consecutiveLosses}
              </span>
              <span className="text-gray-500">/ {maxLosses}</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-poly-dark overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 progress-gradient-${riskColor}`}
              style={{ width: `${riskLevel * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Safe</span>
            <span>Auto-pause at {maxLosses}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

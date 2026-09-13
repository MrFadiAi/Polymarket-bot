import type { BotState, BotConfig } from '../types';

interface RiskPanelProps {
  state: BotState | null;
  config: BotConfig | null;
}

interface RiskMeterProps {
  label: string;
  /** Current usage value, in the same unit as limit */
  value: number;
  /** Limit the value is compared against */
  limit: number;
  /** Render the value/limit text (defaults to $ formatting) */
  format?: (value: number, limit: number) => string;
  /** Higher = worse. Meters where HIGH value is good (e.g. drawdown headroom) pass this */
  invert?: boolean;
}

function riskColorFor(usagePct: number): string {
  if (usagePct >= 0.8) return 'red';
  if (usagePct >= 0.5) return 'yellow';
  return 'green';
}

function RiskMeter({ label, value, limit, format, invert = false }: RiskMeterProps) {
  const safeLimit = limit > 0 ? limit : 1;
  const usagePct = Math.max(0, Math.min(1, value / safeLimit));
  const shownPct = invert ? 1 - usagePct : usagePct;
  const color = riskColorFor(invert ? usagePct : usagePct);
  const fmt = format ?? ((v: number, l: number) => `$${v.toFixed(2)} / $${l.toFixed(2)}`);

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-gray-400">{label}</span>
        <span className={`font-mono ${color === 'red' ? 'text-red-400' : color === 'yellow' ? 'text-yellow-400' : 'text-gray-300'}`}>
          {fmt(value, safeLimit)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full progress-gradient-${color} transition-all duration-500`}
          style={{ width: `${shownPct * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Risk Status — visualizes the bot's 6-layer protection usage from the
 * broadcast state (all fields backend-authoritative). Loss-side meters show
 * usage of each limit; drawdown shows distance from peak capital.
 */
export function RiskPanel({ state, config }: RiskPanelProps) {
  const capital = config?.capital?.totalUsd ?? 0;
  const risk = config?.risk;

  const dailyLimit = capital * (risk?.dailyMaxLossPct ?? 0.05);
  const monthlyLimit = capital * (risk?.monthlyMaxLossPct ?? 0.15);
  const drawdownLimit = risk?.maxDrawdownFromPeak ?? 0.25;
  const exposureLimit = capital * (config?.capital?.maxTotalExposurePct ?? 0.30);
  const maxStreak = risk?.maxConsecutiveLosses ?? 6;

  const dailyLoss = Math.max(0, -(state?.dailyPnL ?? 0));
  const monthlyLoss = Math.max(0, -(state?.monthlyPnL ?? 0));
  const drawdown = state?.currentDrawdown ?? 0;
  const exposure = state?.totalExposureUsd ?? 0;
  const lossStreak = state?.consecutiveLosses ?? 0;
  const paused = state?.isPaused ?? false;
  const halted = state?.permanentlyHalted ?? false;

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-red-500/20 to-orange-500/20">🛡️</div>
          Risk Status
        </h3>
        <div className="flex items-center gap-2">
          {halted && <span className="badge badge-red">🛑 HALTED</span>}
          {!halted && paused && <span className="badge badge-yellow">⏸️ PAUSED</span>}
          {!halted && !paused && <span className="badge badge-green">✅ OK</span>}
        </div>
      </div>
      <div className="panel-body">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <RiskMeter label="Daily Loss Limit" value={dailyLoss} limit={dailyLimit} />
          <RiskMeter label="Monthly Loss Limit" value={monthlyLoss} limit={monthlyLimit} />
          <RiskMeter
            label="Drawdown from Peak"
            value={drawdown}
            limit={drawdownLimit}
            format={(v, l) => `${(v * 100).toFixed(1)}% / ${(l * 100).toFixed(0)}%`}
          />
          <RiskMeter label="Open Exposure" value={exposure} limit={exposureLimit} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-white/5 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-gray-400">
              Streak:{' '}
              <span className={`font-mono ${lossStreak >= maxStreak ? 'text-red-400' : lossStreak >= maxStreak * 0.6 ? 'text-yellow-400' : 'text-gray-300'}`}>
                {lossStreak}L / {state?.consecutiveWins ?? 0}W
              </span>
              <span className="text-gray-600"> (pause @ {maxStreak}L)</span>
            </span>
            <span className="text-gray-400">
              Capital:{' '}
              <span className="font-mono text-gray-300">
                ${(state?.currentCapital ?? capital).toFixed(2)}
              </span>
              <span className="text-gray-600"> (peak ${(state?.peakCapital ?? capital).toFixed(2)})</span>
            </span>
          </div>
          <span className="text-gray-600">
            6-layer protection: daily · monthly · drawdown · total halt · loss streak · exposure cap
          </span>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { BotState, BotConfig } from '../types';

interface HeaderProps {
  state: BotState | null;
  config: BotConfig | null;
  connected: boolean;
  onHistoryClick?: () => void;
  onPositionsClick?: () => void;
  onToggleDryRun?: () => void;
}

export function Header({ state, config, connected, onHistoryClick, onPositionsClick, onToggleDryRun }: HeaderProps) {
  const [runtime, setRuntime] = useState('0m');

  useEffect(() => {
    if (!state?.startTime) return;

    const updateRuntime = () => {
      const diff = Date.now() - state.startTime;
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setRuntime(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setRuntime(`${minutes}m ${seconds}s`);
      } else {
        setRuntime(`${seconds}s`);
      }
    };

    updateRuntime();
    const interval = setInterval(updateRuntime, 1000);
    return () => clearInterval(interval);
  }, [state?.startTime]);

  const isPaused = state?.isPaused ?? false;
  const isHalted = state?.permanentlyHalted ?? false;
  const isDryRun = config?.dryRun ?? true;

  const signalCount = state?.dipArb?.signals?.length ?? 0;
  const opportunityCount = state?.arbitrage?.opportunitiesFound ?? 0;

  return (
    <header className="glass-card border-b border-white/5 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left: Logo + Status */}
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xl shadow-glow-purple">
              🤖
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Polymarket Bot
              </h1>
              <div className="text-xs text-gray-500">v3.2 Professional</div>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2">
            <span
              className={`badge flex items-center gap-1.5 ${connected
                ? isHalted
                  ? 'badge-red'
                  : isPaused
                    ? 'badge-yellow'
                    : 'badge-green'
                : 'badge-red'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connected
                ? isHalted || isPaused ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'
                : 'bg-red-400'
                }`} />
              {connected ? (isHalted ? '🛑 HALTED' : isPaused ? 'PAUSED' : 'RUNNING') : 'OFFLINE'}
            </span>

            <span className={`badge ${isDryRun ? 'badge-blue' : 'badge-green'}`}>
              {isDryRun ? '🧪 SIMULATION' : '💰 LIVE'}
            </span>
          </div>
        </div>

        {/* Right: Stats + Wallet */}
        <div className="flex items-center gap-6">
          {/* History Button */}
          <button
            onClick={onHistoryClick}
            className="btn btn-secondary text-sm"
          >
            <span>📚</span>
            History
          </button>

          {/* Positions Button */}
          <button
            onClick={onPositionsClick}
            className="btn btn-secondary text-sm"
          >
            <span>📦</span>
            Positions
          </button>

          {/* Toggle Dry Run / Live */}
          <button
            onClick={onToggleDryRun}
            className={`btn text-sm ${isDryRun
                ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20 text-green-300'
                : 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-300'
              }`}
          >
            <span>{isDryRun ? '💰' : '🧪'}</span>
            Switch to {isDryRun ? 'LIVE' : 'DRY RUN'}
          </button>

          <div className="w-px h-8 bg-white/10" />

          {/* Notification Badges */}
          <div className="flex items-center gap-3">
            {signalCount > 0 && (
              <div className="relative tooltip" data-tooltip="Recent Signals">
                <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center text-sm">
                  🎯
                </div>
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center font-bold">
                  {Math.min(signalCount, 99)}
                </span>
              </div>
            )}
            {opportunityCount > 0 && (
              <div className="relative tooltip" data-tooltip="Opportunities Found">
                <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center text-sm">
                  💎
                </div>
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-bold">
                  {Math.min(opportunityCount, 99)}
                </span>
              </div>
            )}
          </div>

          {/* Runtime */}
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Runtime</div>
            <div className="text-lg font-mono font-bold text-white">{runtime}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

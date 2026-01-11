import { useEffect, useState } from 'react';
import type { BotState, BotConfig } from '../types';
import { NetworkStatus } from './NetworkStatus';

interface HeaderProps {
  state: BotState | null;
  config: BotConfig | null;
  connected: boolean;
  onHistoryClick?: () => void;
  onPositionsClick?: () => void;
}

export function Header({ state, config, connected, onHistoryClick, onPositionsClick }: HeaderProps) {
  const [runtime, setRuntime] = useState('0m');
  const [copied, setCopied] = useState(false);

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
  const isDryRun = config?.dryRun ?? true;

  // Mock wallet address (in real app, this would come from config/state)
  const walletAddress = '0xaF98e0638671abD5140Ad981Ff4c01869F3410de';
  const shortWallet = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  const copyWallet = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              <div className="text-xs text-gray-500">v3.0 Professional</div>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2">
            <span
              className={`badge flex items-center gap-1.5 ${connected
                ? isPaused
                  ? 'badge-yellow'
                  : 'badge-green'
                : 'badge-red'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connected
                ? isPaused ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'
                : 'bg-red-400'
                }`} />
              {connected ? (isPaused ? 'PAUSED' : 'RUNNING') : 'OFFLINE'}
            </span>

            <span className={`badge ${isDryRun ? 'badge-blue' : 'badge-green'}`}>
              {isDryRun ? '🧪 SIMULATION' : '💰 LIVE'}
            </span>
          </div>
        </div>

        {/* Center: Network Status */}
        <div className="hidden lg:block">
          <NetworkStatus connected={connected} />
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

          <div className="w-px h-10 bg-white/10" />

          {/* Wallet */}
          <button
            onClick={copyWallet}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-poly-dark/50 border border-poly-border hover:border-poly-purple/50 transition-all group"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-blue-400" />
            <span className="font-mono text-sm text-gray-300 group-hover:text-white transition-colors">
              {shortWallet}
            </span>
            <span className="text-gray-500 group-hover:text-gray-300 transition-colors">
              {copied ? '✓' : '📋'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

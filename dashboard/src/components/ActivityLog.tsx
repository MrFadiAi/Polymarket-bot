import { useState, useMemo } from 'react';
import type { LogEntry, LogLevel } from '../types';

interface ActivityLogProps {
  logs: LogEntry[];
}

const LOG_ICONS: Record<LogLevel, string> = {
  INFO: '📋',
  WARN: '⚠️',
  ERROR: '❌',
  TRADE: '💰',
  SIGNAL: '🎯',
  ARB: '🔄',
  WALLET: '👛',
  CHAIN: '⛓️',
  SWAP: '💱',
  BRIDGE: '🌉',
  KLINE: '📊',
  TREND: '📈',
};

const LOG_STYLES: Record<LogLevel, { text: string; bg: string; border: string }> = {
  INFO: { text: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
  WARN: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  ERROR: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  TRADE: { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  SIGNAL: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  ARB: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  WALLET: { text: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
  CHAIN: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  SWAP: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
  BRIDGE: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  KLINE: { text: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
  TREND: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
};

const FILTER_OPTIONS: (LogLevel | 'ALL')[] = [
  'ALL',
  'TRADE',
  'SIGNAL',
  'ARB',
  'WALLET',
  'ERROR',
  'WARN',
  'INFO',
];

export function ActivityLog({ logs }: ActivityLogProps) {
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    if (filter === 'ALL') return logs;
    return logs.filter((log) => log.level === filter);
  }, [logs, filter]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="panel flex flex-col h-[450px]">
      <div className="panel-header flex-shrink-0">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-gray-500/20 to-slate-500/20">
            📋
          </div>
          Activity Log
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({filteredLogs.length})
          </span>
        </h2>

        <div className="flex gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === opt
                  ? 'bg-gradient-to-r from-poly-purple to-poly-blue text-white shadow-glow-purple'
                  : 'bg-poly-dark text-gray-400 hover:bg-poly-border hover:text-white'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-4xl mb-3">📭</div>
            <div>No logs to display</div>
            <div className="text-xs text-gray-600 mt-1">Activity will appear here</div>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const style = LOG_STYLES[log.level];
            return (
              <div
                key={log.id}
                className={`px-4 py-3 rounded-xl border ${style.bg} ${style.border} cursor-pointer transition-all hover:border-white/20`}
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-base flex-shrink-0">{LOG_ICONS[log.level]}</span>
                  <span className="text-xs text-gray-500 font-mono w-16 flex-shrink-0 pt-0.5">
                    {formatTime(log.timestamp)}
                  </span>
                  <span
                    className={`text-xs font-semibold w-14 flex-shrink-0 pt-0.5 ${style.text}`}
                  >
                    {log.level}
                  </span>
                  <span className="text-sm text-gray-300 flex-1 break-words leading-relaxed">
                    {log.message}
                  </span>
                </div>

                {expanded === log.id && log.data !== undefined && (
                  <pre className="mt-3 ml-9 p-3 bg-poly-dark rounded-lg text-xs text-gray-400 overflow-x-auto border border-white/5">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Auto-scroll indicator */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
        <span>Latest logs shown first</span>
        <span className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live updates
        </span>
      </div>
    </div>
  );
}

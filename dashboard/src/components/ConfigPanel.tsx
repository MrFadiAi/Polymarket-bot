import type { BotConfig } from '../types';

interface ConfigPanelProps {
  config: BotConfig | null;
}

interface ConfigItemProps {
  label: string;
  value: string | number | boolean;
  type?: 'text' | 'boolean' | 'number';
}

function ConfigItem({ label, value, type = 'text' }: ConfigItemProps) {
  const renderValue = () => {
    if (type === 'boolean') {
      return (
        <span className={`badge ${value ? 'badge-green' : 'badge-red'}`}>
          {value ? 'Enabled' : 'Disabled'}
        </span>
      );
    }
    if (type === 'number') {
      return <span className="font-mono text-white">{value}</span>;
    }
    return <span className="text-white">{String(value)}</span>;
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-gray-400 text-sm">{label}</span>
      {renderValue()}
    </div>
  );
}

export function ConfigPanel({ config }: ConfigPanelProps) {
  if (!config) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h2 className="section-header mb-0">
            <div className="section-header-icon bg-gradient-to-br from-gray-500/20 to-slate-500/20">
              ⚙️
            </div>
            Configuration
          </h2>
        </div>
        <div className="panel-body text-center py-8">
          <div className="text-gray-500">Loading configuration...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-gray-500/20 to-slate-500/20">
            ⚙️
          </div>
          Configuration
        </h2>
        <span className={`badge ${config.dryRun ? 'badge-blue' : 'badge-green'}`}>
          {config.dryRun ? '🧪 Simulation' : '💰 Live'}
        </span>
      </div>

      <div className="panel-body">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* General Settings */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              General
            </div>
            <div className="bg-poly-dark/50 rounded-xl p-4 space-y-1 divide-y divide-white/5">
              <ConfigItem label="Mode" value={config.dryRun ? 'Dry Run' : 'Live'} />
              <ConfigItem label="Capital" value={`$${config.capital?.totalUsd ?? 0}`} />
            </div>
          </div>

          {/* Strategies */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Strategies
            </div>
            <div className="bg-poly-dark/50 rounded-xl p-4 space-y-1 divide-y divide-white/5">
              <ConfigItem label="Smart Money" value={config.smartMoney?.enabled ?? false} type="boolean" />
              <ConfigItem label="Arbitrage" value={config.arbitrage?.enabled ?? false} type="boolean" />
              <ConfigItem label="DipArb" value={config.dipArb?.enabled ?? false} type="boolean" />
              <ConfigItem label="Direct Trading" value={config.directTrading?.enabled ?? false} type="boolean" />
            </div>
          </div>

          {/* Risk Settings */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
              Risk Management
            </div>
            <div className="bg-poly-dark/50 rounded-xl p-4 space-y-1 divide-y divide-white/5">
              <ConfigItem label="Daily Max Loss" value={`${config.risk?.dailyMaxLossPct ?? 10}%`} />
              <ConfigItem label="Max Consecutive Losses" value={config.risk?.maxConsecutiveLosses ?? 6} type="number" />
              <ConfigItem label="Pause Duration" value={`${config.risk?.pauseOnBreachMinutes ?? 30}m`} />
            </div>
          </div>

          {/* Integrations */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Integrations
            </div>
            <div className="bg-poly-dark/50 rounded-xl p-4 space-y-1 divide-y divide-white/5">
              <ConfigItem label="Binance K-lines" value={config.binance?.enabled ?? false} type="boolean" />
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-400 text-sm">Network</span>
                <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Polygon
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="text-xs text-gray-500 text-center">
          Configuration loaded from bot-config.ts • Restart bot to apply changes
        </div>
      </div>
    </div>
  );
}

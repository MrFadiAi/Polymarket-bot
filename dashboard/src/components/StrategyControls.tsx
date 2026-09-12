import type { BotConfig } from '../types';

interface StrategyControlsProps {
    config: BotConfig | null;
    onToggle: (strategy: string, enabled: boolean) => void;
    onEmergencyStop: () => void;
    onPanicSell: () => void;
}

interface ToggleProps {
    label: string;
    enabled: boolean;
    icon: string;
    color: string;
    onChange: (enabled: boolean) => void;
}

function Toggle({ label, enabled, icon, color, onChange }: ToggleProps) {
    return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-poly-dark/50 border border-white/5">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-${color}-500/20 flex items-center justify-center text-sm`}>
                    {icon}
                </div>
                <span className="text-white font-medium">{label}</span>
            </div>
            <button
                onClick={() => onChange(!enabled)}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 ${enabled ? `bg-${color}-500` : 'bg-gray-700'
                    }`}
            >
                <div
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${enabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    );
}

export function StrategyControls({ config, onToggle, onEmergencyStop, onPanicSell }: StrategyControlsProps) {
    if (!config) return null;

    const strategies = [
        {
            key: 'smartMoney',
            label: 'Smart Money (Copy Trading)',
            icon: '👛',
            color: 'purple',
            enabled: config.smartMoney?.enabled ?? false,
        },
        {
            key: 'arbitrage',
            label: 'Arbitrage',
            icon: '⚖️',
            color: 'blue',
            enabled: config.arbitrage?.enabled ?? false,
        },
        {
            key: 'dipArb',
            label: 'DipArb (Crypto Short-Term)',
            icon: '📉',
            color: 'green',
            enabled: config.dipArb?.enabled ?? false,
        },
        {
            key: 'directTrading',
            label: 'Direct Trading (Trend Following)',
            icon: '📈',
            color: 'yellow',
            enabled: config.directTrading?.enabled ?? false,
        },
    ];

    return (
        <div className="panel">
            <div className="panel-header">
                <h3 className="section-header mb-0">
                    <div className="section-header-icon bg-gradient-to-br from-purple-500/20 to-blue-500/20">⚙️</div>
                    Strategy Controls
                </h3>
            </div>
            <div className="panel-body space-y-2">
                {strategies.map((s) => (
                    <Toggle
                        key={s.key}
                        label={s.label}
                        icon={s.icon}
                        color={s.color}
                        enabled={s.enabled}
                        onChange={(enabled) => onToggle(s.key, enabled)}
                    />
                ))}
                {/* v3.2 emergency controls — static Tailwind classes only
                    (dynamic bg-${color}-500 interpolation is JIT-purged) */}
                <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-white/5">
                    <button
                        onClick={onEmergencyStop}
                        className="text-xs py-2 rounded-lg bg-red-600/10 border border-red-600/40 text-red-300 hover:bg-red-600/20 transition-colors"
                    >
                        🛑 Emergency Stop
                    </button>
                    <button
                        onClick={onPanicSell}
                        className="text-xs py-2 rounded-lg bg-orange-600/10 border border-orange-600/40 text-orange-300 hover:bg-orange-600/20 transition-colors"
                    >
                        🚨 Panic Sell
                    </button>
                </div>
                <div className="text-xs text-gray-500 mt-2 text-center">
                    Changes take effect immediately. You may need sufficient USDC.e for trading strategies.
                </div>
            </div>
        </div>
    );
}

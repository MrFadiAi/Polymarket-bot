import { useState } from 'react';
import type { BotState } from '../types';

interface PositionsPageProps {
    onBack: () => void;
    state: BotState | null;
    onClosePosition: (tokenId: string, size: number) => void;
    onRedeemPosition: (conditionId: string) => void;
}

export function PositionsPage({ onBack, state, onClosePosition, onRedeemPosition }: PositionsPageProps) {
    const [closingId, setClosingId] = useState<string | null>(null);
    const [redeemingId, setRedeemingId] = useState<string | null>(null);

    const positions = state?.positions || [];

    const formatPnL = (value: number) => {
        const formatted = Math.abs(value).toFixed(2);
        return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
    };

    const handleClose = async (pos: any) => {
        setClosingId(pos.asset);
        onClosePosition(pos.asset, pos.size);
        setTimeout(() => setClosingId(null), 3000);
    };

    const handleRedeem = async (pos: any) => {
        setRedeemingId(pos.conditionId);
        onRedeemPosition(pos.conditionId);
        setTimeout(() => setRedeemingId(null), 5000);
    };

    return (
        <div className="min-h-screen bg-poly-dark text-white">
            {/* Header */}
            <header className="glass-card border-b border-white/5 px-6 py-4">
                <div className="flex items-center justify-between max-w-[1600px] mx-auto">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="btn btn-secondary">
                            ← Back to Dashboard
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-xl">
                                📦
                            </div>
                            <div>
                                <h1 className="text-xl font-bold">Open Positions</h1>
                                <div className="text-xs text-gray-500">Monitor and close your positions</div>
                            </div>
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Positions</div>
                            <div className="text-xl font-bold font-mono">{positions.length}</div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-6 max-w-[1600px] mx-auto">
                {positions.length === 0 ? (
                    <div className="panel p-12 text-center">
                        <div className="text-6xl mb-4">📭</div>
                        <h2 className="text-xl font-semibold mb-2">No Open Positions</h2>
                        <p className="text-gray-400">
                            You don't have any open positions yet. Start trading to see them here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4 animate-fade-in">
                        {/* Positions Table */}
                        <div className="panel">
                            <div className="panel-header">
                                <h3 className="section-header mb-0">
                                    <div className="section-header-icon bg-gradient-to-br from-green-500/20 to-emerald-500/20">💹</div>
                                    Your Positions
                                </h3>
                            </div>
                            <div className="panel-body">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wider">
                                                <th className="pb-3 pr-4">Market</th>
                                                <th className="pb-3 pr-4">Outcome</th>
                                                <th className="pb-3 pr-4 text-right">Size</th>
                                                <th className="pb-3 pr-4 text-right">Avg Price</th>
                                                <th className="pb-3 pr-4 text-right">Current</th>
                                                <th className="pb-3 pr-4 text-right">P&L</th>
                                                <th className="pb-3 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {positions.map((pos: any) => {
                                                const pnl = pos.cashPnl ?? 0;
                                                const pnlPct = (pos.percentPnl ?? 0) * 100;
                                                const isClosing = closingId === pos.asset;

                                                return (
                                                    <tr key={pos.asset} className="hover:bg-white/5 transition-colors">
                                                        <td className="py-4 pr-4">
                                                            <div className="max-w-[300px] truncate text-gray-200" title={pos.title}>
                                                                {pos.title || 'Unknown Market'}
                                                            </div>
                                                            <div className="text-xs text-gray-500 truncate">{pos.slug}</div>
                                                        </td>
                                                        <td className="py-4 pr-4">
                                                            <span className={`badge ${pos.outcome === 'Yes' || pos.outcome === 'Up' ? 'badge-green' : 'badge-red'}`}>
                                                                {pos.outcome}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 pr-4 text-right font-mono">
                                                            {pos.size?.toFixed(2) ?? '0.00'}
                                                        </td>
                                                        <td className="py-4 pr-4 text-right font-mono text-gray-400">
                                                            ${pos.avgPrice?.toFixed(3) ?? '0.000'}
                                                        </td>
                                                        <td className="py-4 pr-4 text-right font-mono text-gray-400">
                                                            ${pos.curPrice?.toFixed(3) ?? '0.000'}
                                                        </td>
                                                        <td className="py-4 pr-4 text-right">
                                                            <div className={`font-mono font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {formatPnL(pnl)}
                                                            </div>
                                                            <div className={`text-xs ${pnlPct >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                                                                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                                            </div>
                                                        </td>
                                                        <td className="py-4 text-center">
                                                            <td className="py-4 text-center">
                                                                {pos.marketClosed ? (
                                                                    pos.isWinner ? (
                                                                        <button
                                                                            onClick={() => handleRedeem(pos)}
                                                                            disabled={redeemingId === pos.conditionId}
                                                                            className={`btn ${redeemingId === pos.conditionId ? 'btn-secondary opacity-50' : 'btn-primary bg-green-500 hover:bg-green-600'} text-sm px-4 py-2`}
                                                                        >
                                                                            {redeemingId === pos.conditionId ? 'Redeeming...' : '💰 Redeem'}
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-gray-500 text-sm font-medium">Outcome Lost</span>
                                                                    )
                                                                ) : (
                                                                    <button
                                                                        onClick={() => handleClose(pos)}
                                                                        disabled={isClosing}
                                                                        className={`btn ${isClosing ? 'btn-secondary opacity-50' : 'btn-primary bg-red-500 hover:bg-red-600'} text-sm px-4 py-2`}
                                                                    >
                                                                        {isClosing ? 'Closing...' : 'Close'}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="panel bg-blue-500/10 border-blue-500/30">
                            <div className="panel-body flex items-start gap-3">
                                <div className="text-2xl">ℹ️</div>
                                <div>
                                    <h4 className="font-semibold text-blue-400 mb-1">How Closing Works</h4>
                                    <p className="text-sm text-gray-400">
                                        Clicking "Close" will sell your entire position at market price. The order will be executed
                                        immediately via Polymarket's order book. Make sure you are in <strong>Live Mode</strong>
                                        (not Dry Run) for the sell to execute.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

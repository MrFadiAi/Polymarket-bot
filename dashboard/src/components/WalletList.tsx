import type { BotState } from '../types';

interface WalletListProps {
  state: BotState | null;
}

export function WalletList({ state }: WalletListProps) {
  const wallets = state?.followedWallets ?? [];

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  const copyToClipboard = async (addr: string) => {
    await navigator.clipboard.writeText(addr);
  };

  // Generate a consistent color for each wallet
  const getWalletColor = (addr: string) => {
    const colors = [
      'from-purple-400 to-pink-400',
      'from-blue-400 to-cyan-400',
      'from-green-400 to-emerald-400',
      'from-yellow-400 to-orange-400',
      'from-red-400 to-pink-400',
      'from-indigo-400 to-purple-400',
    ];
    const hash = addr.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-purple-500/20 to-pink-500/20">
            👥
          </div>
          Followed Wallets
        </h2>
        <span className="badge badge-purple">
          {wallets.length} wallets
        </span>
      </div>

      <div className="panel-body">
        {wallets.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-gray-400">No wallets configured</div>
            <div className="text-xs text-gray-500 mt-1">Add wallets in bot-config.ts</div>
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.map((wallet, index) => (
              <div
                key={wallet}
                className="flex items-center justify-between p-3 bg-poly-dark/50 rounded-xl border border-white/5 hover:border-white/10 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getWalletColor(wallet)}`} />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-poly-dark" />
                  </div>
                  <div>
                    <code className="text-sm text-gray-300 font-mono group-hover:text-white transition-colors">
                      {shortenAddress(wallet)}
                    </code>
                    <div className="text-xs text-gray-500">Whale #{index + 1}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(wallet)}
                    className="p-2 rounded-lg bg-poly-gray hover:bg-poly-border transition-colors text-gray-400 hover:text-white"
                    title="Copy address"
                  >
                    📋
                  </button>
                  <a
                    href={`https://polygonscan.com/address/${wallet}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-poly-gray hover:bg-poly-border transition-colors text-gray-400 hover:text-white"
                    title="View on Polygonscan"
                  >
                    🔗
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {wallets.length > 0 && (
          <>
            <div className="divider" />
            <div className="text-xs text-gray-500 text-center">
              Tracking whale wallets for copy trading signals
            </div>
          </>
        )}
      </div>
    </div>
  );
}

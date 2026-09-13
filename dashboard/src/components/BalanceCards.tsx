import type { BotState, BotConfig } from '../types';

interface BalanceCardsProps {
  state: BotState | null;
  config: BotConfig | null;
}

interface BalanceCardProps {
  icon: string;
  label: string;
  value: string;
  subLabel?: string;
  gradient: string;
  iconBg: string;
}

function BalanceCard({ icon, label, value, subLabel, gradient, iconBg }: BalanceCardProps) {
  return (
    <div className={`glass-card glass-card-hover rounded-lg p-3 ${gradient}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
          <div className="text-lg font-bold font-mono text-white truncate">
            {value}
          </div>
        </div>
        {subLabel && (
          <div className="text-[10px] text-gray-600 hidden xl:block">{subLabel}</div>
        )}
      </div>
    </div>
  );
}

export function BalanceCards({ state, config }: BalanceCardsProps) {
  const isDryRun = config?.dryRun ?? true;
  const paper = state?.paper;

  const formatCurrency = (value: number, decimals: number = 2) => {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // In DRY RUN the real wallet balances are irrelevant — show what the
  // simulation is actually trading with (paper wallet)
  if (isDryRun && paper) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <BalanceCard
          icon="📝"
          label="Paper Balance"
          value={`$${formatCurrency(paper.balance)}`}
          subLabel="Simulated"
          gradient="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5"
          iconBg="bg-cyan-500/20"
        />
        <BalanceCard
          icon="📈"
          label="Session PnL"
          value={`${paper.pnl >= 0 ? '+' : '-'}$${formatCurrency(Math.abs(paper.pnl))}`}
          subLabel="Simulated"
          gradient="bg-gradient-to-br from-green-500/10 to-green-500/5"
          iconBg="bg-green-500/20"
        />
        <BalanceCard
          icon="🔁"
          label="Sim Trades"
          value={String(paper.trades)}
          subLabel="This session"
          gradient="bg-gradient-to-br from-purple-500/10 to-purple-500/5"
          iconBg="bg-purple-500/20"
        />
        <BalanceCard
          icon="💵"
          label="Sim Volume"
          value={`$${formatCurrency(paper.totalVolume)}`}
          subLabel="Notional traded"
          gradient="bg-gradient-to-br from-blue-500/10 to-blue-500/5"
          iconBg="bg-blue-500/20"
        />
      </div>
    );
  }

  const matic = state?.maticBalance ?? 0;
  const usdc = state?.usdcBalance ?? 0;
  const usdce = state?.usdcEBalance ?? 0;
  const total = usdc + usdce;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
      <BalanceCard
        icon="💜"
        label="MATIC"
        value={formatCurrency(matic, 4)}
        subLabel="Gas"
        gradient="bg-gradient-to-br from-purple-500/10 to-purple-500/5"
        iconBg="bg-purple-500/20"
      />
      <BalanceCard
        icon="💵"
        label="USDC"
        value={`$${formatCurrency(usdc)}`}
        subLabel="Bridged"
        gradient="bg-gradient-to-br from-green-500/10 to-green-500/5"
        iconBg="bg-green-500/20"
      />
      <BalanceCard
        icon="💰"
        label="USDC.e"
        value={`$${formatCurrency(usdce)}`}
        subLabel="Native"
        gradient="bg-gradient-to-br from-blue-500/10 to-blue-500/5"
        iconBg="bg-blue-500/20"
      />
      <BalanceCard
        icon="🏦"
        label="Total"
        value={`$${formatCurrency(total)}`}
        subLabel="Capital"
        gradient="bg-gradient-to-br from-yellow-500/10 to-orange-500/5"
        iconBg="bg-yellow-500/20"
      />
    </div>
  );
}

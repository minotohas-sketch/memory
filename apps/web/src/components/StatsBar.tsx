import type { MeResponse } from "../lib/api";

interface Props {
  me: MeResponse;
}

export function StatsBar({ me }: Props) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface border border-surface-2 px-4 py-2.5 font-mono text-sm">
      <span className="flex items-center gap-1.5 text-gold font-bold">🪙 {me.coins}</span>
      <span className="flex items-center gap-1.5 text-sage">
        ⚡ {me.energy}<span className="text-sage/50">/{me.energy_max}</span>
      </span>
      {me.streak_count > 0 && (
        <span className="flex items-center gap-1.5 text-coral">🔥 {me.streak_count}</span>
      )}
      <span className="flex items-center gap-1.5 text-sage">
        Nv. <span className="text-cream">{me.account_level}</span>
      </span>
    </div>
  );
}

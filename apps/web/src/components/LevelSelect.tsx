import type { LevelConfig } from "@memory-match/shared";
import type { ApiClient, MeResponse } from "../lib/api";
import { useRewardAd } from "../lib/useRewardAd";
import { useMonetagEarnCoins, useMonetagEnergyRefill } from "../lib/useMonetag";
import { StatsBar } from "./StatsBar";
import { RewardAdButton } from "./RewardAdButton";

interface Props {
  levels: LevelConfig[];
  onSelect: (level: LevelConfig) => void;
  onShowLeaderboard: () => void;
  onShowReferral: () => void;
  onShowTasks: () => void;
  onShowWithdraw: () => void;
  playerName: string;
  me: MeResponse;
  api: ApiClient;
  onMeUpdate: (me: MeResponse) => void;
}

export function LevelSelect({
  levels,
  onSelect,
  onShowLeaderboard,
  onShowReferral,
  onShowTasks,
  onShowWithdraw,
  playerName,
  me,
  api,
  onMeUpdate,
}: Props) {
  const energyAd = useRewardAd(import.meta.env.VITE_ADSGRAM_ENERGY_BLOCK_ID, api, onMeUpdate);
  const bonusAd = useRewardAd(import.meta.env.VITE_ADSGRAM_BONUS_BLOCK_ID, api, onMeUpdate);
  const monetagCoinsAd = useMonetagEarnCoins(api, onMeUpdate);
  const monetagEnergyAd = useMonetagEnergyRefill(api, onMeUpdate);

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 max-w-md mx-auto">
      <header className="text-center">
        <p className="text-sm text-sage tracking-wide">Bienvenue, {playerName}</p>
        <h1 className="font-display text-4xl font-semibold text-cream mt-1">Memory Match</h1>
      </header>

      <StatsBar me={me} />

      <div className="flex gap-2.5">
        <RewardAdButton
          label="+1 énergie"
          icon="⚡"
          status={energyAd.status}
          onClick={energyAd.watch}
          disabled={me.energy >= me.energy_max}
          cooldownSeconds={me.adCooldowns.energy_refill}
        />
        <RewardAdButton
          label="Coins bonus"
          icon="🪙"
          status={bonusAd.status}
          onClick={bonusAd.watch}
          cooldownSeconds={me.adCooldowns.bonus_coins}
        />
      </div>

      <div className="flex gap-2.5 -mt-2">
        <RewardAdButton
          label="+3 énergie"
          icon="⚡"
          status={monetagEnergyAd.status}
          onClick={monetagEnergyAd.watch}
          disabled={me.energy >= me.energy_max}
          cooldownSeconds={me.adCooldowns.monetag_energy_refill}
        />
        <RewardAdButton
          label="+50 coins"
          icon="🪙"
          status={monetagCoinsAd.status}
          onClick={monetagCoinsAd.watch}
          cooldownSeconds={me.adCooldowns.monetag_earn_coins}
        />
      </div>

      {me.energy < 1 && (
        <p className="text-xs text-coral text-center -mt-2">
          Plus d'énergie pour lancer une partie — regarde une pub ou attends qu'elle revienne.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {levels.map((level, i) => (
          <button
            key={level.id}
            onClick={() => onSelect(level)}
            disabled={me.energy < 1}
            className="group relative flex items-center justify-between rounded-2xl bg-surface border border-surface-2 px-5 py-4 text-left transition-all hover:border-gold/50 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gold">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-xl font-semibold text-cream">{level.name}</span>
              </div>
              <p className="text-xs text-sage mt-1">
                {level.cols}×{level.rows} · {level.pairs} paires · {level.timeLimitSeconds}s
              </p>
            </div>
            <div className="font-mono text-gold font-bold">+{level.baseReward}</div>
          </button>
        ))}
      </div>

      <div className="flex justify-center gap-4 mt-1 flex-wrap">
        <button
          onClick={onShowLeaderboard}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-2"
        >
          🏆 Classement
        </button>
        <button
          onClick={onShowReferral}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-2"
        >
          👥 Inviter des amis
        </button>
        <button
          onClick={onShowTasks}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-2"
        >
          📋 Tâches
        </button>
        <button
          onClick={onShowWithdraw}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-2"
        >
          💸 Retirer
        </button>
      </div>
    </div>
  );
}

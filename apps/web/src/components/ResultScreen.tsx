import type { LevelConfig } from "@memory-match/shared";
import type { FinishGameResponse } from "../lib/api";

interface Props {
  result: FinishGameResponse;
  level: LevelConfig;
  onReplay: () => void;
  onBackToLevels: () => void;
}

export function ResultScreen({ result, level, onReplay, onBackToLevels }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 min-h-screen text-center max-w-md mx-auto">
      <div>
        <p className="text-sm text-sage uppercase tracking-widest">{level.name}</p>
        <h1 className="font-display text-4xl font-semibold mt-2 text-cream">
          {result.won ? "Grille complétée !" : "Temps écoulé"}
        </h1>
      </div>

      <div className="w-full rounded-2xl bg-surface border border-surface-2 p-5 flex flex-col gap-3">
        <div className="flex justify-between text-sm text-sage">
          <span>Temps</span>
          <span className="font-mono text-cream">{result.serverTimeTakenSeconds}s</span>
        </div>
        <div className="flex justify-between text-sm text-sage">
          <span>XP gagné</span>
          <span className="font-mono text-cream">+{result.xpEarned}</span>
        </div>
        <div className="h-px bg-surface-2" />
        <div className="flex justify-between items-center">
          <span className="text-sm text-sage">Coins gagnés</span>
          <span className="font-mono text-2xl font-bold text-gold">+{result.coinsEarned}</span>
        </div>
        <div className="flex justify-between items-center text-xs text-sage">
          <span>Solde total</span>
          <span className="font-mono text-cream">{result.user.coins} 🪙</span>
        </div>
      </div>

      {result.streak.bonusCoins > 0 && (
        <div className="w-full rounded-xl bg-coral/10 border border-coral/30 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-cream">🔥 Streak {result.streak.count} jours</span>
          <span className="font-mono text-coral font-bold">+{result.streak.bonusCoins}</span>
        </div>
      )}

      {result.referralBonusPaid && (
        <div className="w-full rounded-xl bg-gold/10 border border-gold/30 px-4 py-3 text-center text-sm text-cream">
          👥 Ta première partie a débloqué le bonus de la personne qui t'a invité !
        </div>
      )}

      <div className="flex flex-col gap-2.5 w-full">
        <button
          onClick={onReplay}
          disabled={result.user.energy < 1}
          className="rounded-xl bg-gold text-ink font-bold py-3.5 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft"
        >
          {result.won ? "Rejouer ce niveau" : "Réessayer"}
        </button>
        <button
          onClick={onBackToLevels}
          className="rounded-xl bg-transparent border border-surface-2 text-cream font-semibold py-3.5 active:scale-[0.98] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Changer de niveau
        </button>
      </div>
    </div>
  );
}

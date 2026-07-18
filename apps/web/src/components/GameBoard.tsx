import type { LevelConfig } from "@memory-match/shared";
import type { CardState } from "../game/types";
import type { EnginePhase, EngineError } from "../game/useGameEngine";
import { GameCard } from "./GameCard";
import { TimerBar } from "./TimerBar";

interface Props {
  level: LevelConfig;
  cards: CardState[];
  secondsLeft: number;
  matchedCount: number;
  moves: number;
  phase: EnginePhase;
  error: EngineError | null;
  onFlip: (id: number) => void;
  onBack: () => void;
}

export function GameBoard({
  level,
  cards,
  secondsLeft,
  matchedCount,
  moves,
  phase,
  error,
  onFlip,
  onBack,
}: Props) {
  if (phase === "starting") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-sage text-sm">Ouverture de la partie…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-cream">{error?.friendlyMessage ?? "Une erreur est survenue."}</p>
        <button
          onClick={onBack}
          className="rounded-xl bg-gold text-ink font-bold px-6 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft"
        >
          Retour aux niveaux
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-6 max-w-md mx-auto">
      <TimerBar secondsLeft={secondsLeft} totalSeconds={level.timeLimitSeconds} />

      <div className="flex justify-between font-mono text-sm text-sage">
        <span>
          Paires <span className="text-cream font-bold">{matchedCount}</span>/{level.pairs}
        </span>
        <span>
          Coups <span className="text-cream font-bold">{moves}</span>
        </span>
      </div>

      <div
        className={`grid gap-2 sm:gap-2.5 transition-opacity ${phase === "finishing" ? "opacity-60 pointer-events-none" : ""}`}
        style={{ gridTemplateColumns: `repeat(${level.cols}, minmax(0, 1fr))` }}
      >
        {cards.map((card) => (
          <GameCard
            key={card.id}
            symbol={card.symbol}
            isFlipped={card.isFlipped}
            isMatched={card.isMatched}
            onClick={() => onFlip(card.id)}
          />
        ))}
      </div>

      {phase === "finishing" && (
        <p className="text-center font-mono text-xs text-sage">Validation du résultat…</p>
      )}
    </div>
  );
}

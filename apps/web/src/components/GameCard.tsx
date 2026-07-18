interface Props {
  symbol: string;
  isFlipped: boolean;
  isMatched: boolean;
  onClick: () => void;
}

export function GameCard({ symbol, isFlipped, isMatched, onClick }: Props) {
  const revealed = isFlipped || isMatched;

  return (
    <button
      onClick={onClick}
      disabled={revealed}
      aria-label={revealed ? `Carte ${symbol}` : "Carte cachée"}
      className="aspect-square [perspective:800px] rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <div
        className={`relative w-full h-full transition-transform duration-500 ease-out [transform-style:preserve-3d] ${
          revealed ? "[transform:rotateY(180deg)]" : ""
        } ${isMatched ? "scale-[0.94] opacity-90" : ""}`}
      >
        {/* Dos de la carte — motif signature */}
        <div
          className="absolute inset-0 rounded-xl [backface-visibility:hidden] bg-surface border border-surface-2"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(232,183,94,0.08) 0px, rgba(232,183,94,0.08) 2px, transparent 2px, transparent 10px)",
          }}
        >
          <div className="absolute inset-2 rounded-lg border border-gold/20" />
        </div>

        {/* Face de la carte */}
        <div
          className={`absolute inset-0 rounded-xl [backface-visibility:hidden] [transform:rotateY(180deg)] flex items-center justify-center text-2xl sm:text-3xl ${
            isMatched ? "bg-mint/15 border-2 border-mint" : "bg-cream/95 border border-gold-soft"
          }`}
        >
          {symbol}
        </div>
      </div>
    </button>
  );
}

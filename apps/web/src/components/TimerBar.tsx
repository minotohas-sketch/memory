interface Props {
  secondsLeft: number;
  totalSeconds: number;
}

export function TimerBar({ secondsLeft, totalSeconds }: Props) {
  const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
  const isCritical = pct <= 20;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const label = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wider text-sage font-semibold">Temps</span>
        <span
          className={`font-mono text-lg font-bold tabular-nums transition-colors ${
            isCritical ? "text-coral" : "text-gold"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            isCritical ? "bg-coral" : "bg-gold"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

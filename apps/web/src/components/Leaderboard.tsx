import { useEffect, useState } from "react";
import type { ApiClient, LeaderboardEntry } from "../lib/api";

interface Props {
  api: ApiClient;
  onBack: () => void;
}

export function Leaderboard({ api, onBack }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .leaderboard()
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Classement</h1>
        <button
          onClick={onBack}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-1"
        >
          ← Retour
        </button>
      </header>
      <p className="text-xs text-sage -mt-3">Coins gagnés cette semaine (depuis lundi 00:00 UTC)</p>

      {failed && <p className="text-sm text-coral">Classement indisponible pour le moment.</p>}

      {!entries && !failed && <p className="text-sm text-sage font-mono">Chargement…</p>}

      {entries && entries.length === 0 && (
        <p className="text-sm text-sage">Personne n'a encore gagné de coins cette semaine — sois le premier !</p>
      )}

      {entries && entries.length > 0 && (
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.rank}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                entry.isMe ? "bg-gold/10 border-gold/40" : "bg-surface border-surface-2"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-sage w-6 text-right">{entry.rank}</span>
                <span className={`font-semibold ${entry.isMe ? "text-gold" : "text-cream"}`}>
                  {entry.name}
                  {entry.isMe && <span className="text-xs text-sage font-normal"> (toi)</span>}
                </span>
              </span>
              <span className="font-mono text-gold font-bold">{entry.coins}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

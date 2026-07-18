import { useEffect, useRef } from "react";

interface Props {
  blockId: string | undefined;
  onBack: () => void;
  onCompleted: () => void;
}

// Même marge que useRewardAd : le crédit vient du postback S2S, pas du
// callback client "reward" — voir memory-match-spec.md §5-6.
const CONFIRM_DELAY_MS = 2500;

export function TasksScreen({ blockId, onBack, onCompleted }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !blockId) return;

    // Leurs deux pages de doc se contredisent sur le nom d'attribut
    // (data-block-id vs block-id, voir spec §5) — on pose les deux pour ne
    // pas dépendre de laquelle est correcte.
    el.setAttribute("block-id", blockId);
    el.setAttribute("data-block-id", blockId);

    const handleReward = () => {
      setTimeout(onCompleted, CONFIRM_DELAY_MS);
    };
    el.addEventListener("reward", handleReward);
    return () => el.removeEventListener("reward", handleReward);
  }, [blockId, onCompleted]);

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Tâches</h1>
        <button
          onClick={onBack}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-1"
        >
          ← Retour
        </button>
      </header>

      <p className="text-sm text-sage">Complète une tâche pour gagner des coins.</p>

      {!blockId && (
        <p className="text-sm text-sage bg-surface border border-surface-2 rounded-xl px-4 py-3">
          Aucune tâche disponible pour le moment.
        </p>
      )}

      {blockId && <adsgram-task ref={ref} className="adsgram-task-widget" data-debug="false" />}
    </div>
  );
}

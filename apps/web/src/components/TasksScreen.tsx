import { useEffect, useRef, useState } from "react";
import { formatCooldown } from "./RewardAdButton";

interface Props {
  blockId: string | undefined;
  onBack: () => void;
  onCompleted: () => void;
  cooldownSeconds?: number;
}

const CONFIRM_DELAY_MS = 2500;

type WidgetStatus = "idle" | "no_task" | "error";

export function TasksScreen({ blockId, onBack, onCompleted, cooldownSeconds = 0 }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<WidgetStatus>("idle");
  const cooldownActive = cooldownSeconds > 0;

  const cleanBlockId = blockId?.trim() || undefined;

  useEffect(() => {
    if (cooldownActive) return; // pas la peine de charger le widget si de toute façon non réclamable

    if (!customElements.get("adsgram-task")) {
      console.error("Adsgram Task component not registered.");
      setStatus("error");
      return;
    }

    const el = ref.current;

    if (!el || !cleanBlockId) return;

    setStatus("idle");

    console.log(
      "[Adsgram Task] blockId =",
      JSON.stringify(cleanBlockId)
    );

    const handleReward = () =>
      setTimeout(onCompleted, CONFIRM_DELAY_MS);

    const handleNoTask = () => setStatus("no_task");

    const handleError = (e?: unknown) => {
      console.error("[Adsgram Task]", e);
      setStatus("error");
    };

    const handleTooLong = () => {
      console.warn("[Adsgram Task] Session too long");
      setStatus("error");
    };

    el.addEventListener("reward", handleReward);
    el.addEventListener("onBannerNotFound", handleNoTask);
    el.addEventListener("onError", handleError);
    el.addEventListener("onTooLongSession", handleTooLong);

    return () => {
      el.removeEventListener("reward", handleReward);
      el.removeEventListener("onBannerNotFound", handleNoTask);
      el.removeEventListener("onError", handleError);
      el.removeEventListener("onTooLongSession", handleTooLong);
    };
  }, [cleanBlockId, onCompleted, cooldownActive]);

  if (!customElements.get("adsgram-task")) {
    return (
      <div className="p-6 text-center">
        Adsgram SDK tsy voaloatra.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 max-w-md mx-auto">

      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">
          Tâches
        </h1>

        <button
          onClick={onBack}
          className="text-sm text-sage font-semibold"
        >
          ← Retour
        </button>
      </header>

      <p className="text-sm text-sage">
        Complète une tâche pour gagner des coins.
      </p>

      {!cleanBlockId && (
        <p className="text-sm text-sage">
          Aucune tâche disponible.
        </p>
      )}

      {cleanBlockId && cooldownActive && (
        <p className="text-sm text-sage bg-surface border border-surface-2 rounded-xl px-4 py-3">
          Prochaine tâche disponible dans {formatCooldown(cooldownSeconds)}.
        </p>
      )}

      {cleanBlockId && !cooldownActive && (
        <>
          <adsgram-task
            key={cleanBlockId}
            ref={ref}
            data-block-id={cleanBlockId}
            data-debug="false"
            className="adsgram-task-widget"
          />

          {status === "no_task" && (
            <p className="text-sm text-sage">
              Pas de tâche disponible.
            </p>
          )}

          {status === "error" && (
            <p className="text-sm text-red-500">
              Erreur Adsgram Task.
            </p>
          )}
        </>
      )}
    </div>
  );
}

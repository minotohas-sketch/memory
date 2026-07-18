import { useState } from "react";
import { useAdsgram } from "./useAdsgram";
import type { ApiClient, MeResponse } from "./api";

export type RewardAdStatus = "idle" | "watching" | "confirming" | "done" | "unavailable" | "error";

// Le crédit réel vient du callback serveur-à-serveur d'Adsgram (Reward URL,
// voir memory-match-spec.md §5), pas du callback client — donc pas instantané.
// On laisse cette marge avant de relire /api/me plutôt que de considérer
// l'absence de changement immédiat comme une erreur.
const CONFIRM_DELAY_MS = 2500;

export function useRewardAd(blockId: string | undefined, api: ApiClient, onCredited: (me: MeResponse) => void) {
  const { show } = useAdsgram(blockId);
  const [status, setStatus] = useState<RewardAdStatus>("idle");

  const watch = async () => {
    if (!blockId) {
      setStatus("unavailable");
      setTimeout(() => setStatus("idle"), 2000);
      return;
    }

    setStatus("watching");
    try {
      await show();
    } catch {
      // Pub fermée/skip/indisponible : pas une vraie erreur, l'utilisateur a
      // juste changé d'avis ou aucune pub n'était chargée.
      setStatus("idle");
      return;
    }

    setStatus("confirming");
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_DELAY_MS));

    try {
      const me = await api.me();
      onCredited(me);
      setStatus("done");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  };

  return { watch, status };
}

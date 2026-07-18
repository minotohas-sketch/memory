import { useEffect, useRef } from "react";
import type { AdsgramController } from "../types/adsgram";

/**
 * Pour les formats Reward et Interstitial uniquement (Task = composant web
 * séparé, voir TasksScreen). blockId peut être undefined tant que la variable
 * d'env correspondante n'est pas configurée — show() rejette proprement dans
 * ce cas plutôt que de planter.
 */
export function useAdsgram(blockId: string | undefined, debug = false) {
  const controllerRef = useRef<AdsgramController | null>(null);

  useEffect(() => {
    if (!blockId || !window.Adsgram) {
      controllerRef.current = null;
      return;
    }
    const controller = window.Adsgram.init({ blockId, debug });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [blockId, debug]);

  const show = () => {
    if (!controllerRef.current) {
      return Promise.reject(new Error("adsgram_not_available"));
    }
    return controllerRef.current.show();
  };

  return { show };
}

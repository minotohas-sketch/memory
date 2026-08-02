import { useEffect, useRef, useCallback } from "react";
import type { AdsgramController } from "../types/adsgram";

/**
 * Pour les formats Reward et Interstitial uniquement (Task = composant web
 * séparé, voir TasksScreen). blockId peut être undefined tant que la variable
 * d'env correspondante n'est pas configurée — show() rejette proprement dans
 * ce cas plutôt que de planter.
 */
export function useAdsgram(
  blockId: string | undefined, 
  debug = import.meta.env.MODE === 'development' // 👈 Auto-detection
) {
  const controllerRef = useRef<AdsgramController | null>(null);

  // ✅ Log conditionnel
  const log = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`[Adsgram] ${message}`, data || "");
    }
  }, [debug]);

  useEffect(() => {
    if (!blockId || !window.Adsgram) {
      log("⏸️ En pause - blockId manquant ou SDK indisponible", { blockId });
      controllerRef.current = null;
      return;
    }

    log("🔄 Initialisation Adsgram...", { blockId });
    const controller = window.Adsgram.init({ blockId, debug });
    controllerRef.current = controller;
    log("✅ Adsgram initialisé avec succès");

    return () => {
      if (controllerRef.current) {
        log("🧹 Destruction Adsgram");
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
    };
  }, [blockId, debug, log]);

  // ✅ show avec message user-friendly
  const show = useCallback((): Promise<void> => {
    if (!controllerRef.current) {
      log("⏸️ Show ignoré - controller non disponible");
      return Promise.reject(new Error("Ads not available")); // 👈 Message user-friendly
    }

    log("📺 Affichage publicité...");
    return controllerRef.current.show()
      .then(() => {
        log("✅ Publicité affichée avec succès");
      })
      .catch((err) => {
        log("❌ Erreur affichage", err);
        throw new Error("Ads not available"); // 👈 Message user-friendly
      });
  }, [log]);

  // ✅ isReady pour vérifier l'état
  const isReady = useCallback((): boolean => {
    const ready = !!controllerRef.current && !!window.Adsgram;
    log(`📊 isReady: ${ready}`);
    return ready;
  }, [log]);

  return { show, isReady };
}

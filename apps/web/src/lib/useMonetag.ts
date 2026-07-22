import { useEffect, useState } from "react";
import type { ApiClient, MeResponse } from "./api";
import type { RewardAdStatus } from "./useRewardAd";

declare global {
  interface Window {
    show_11369203?: (type?: "pop") => Promise<void>;
  }
}

const MONETAG_ZONE_ID = "11369203";

// Même principe que useRewardAd (Adsgram) : le crédit vient d'un postback
// serveur-à-serveur, pas de la résolution de la promise ci-dessous — on
// laisse une marge avant de relire /api/me plutôt que de faire confiance au
// seul callback client.
const CONFIRM_DELAY_MS = 2500;

let sdkLoaded = false;
let sdkLoadingPromise: Promise<void> | null = null;

function loadMonetagSdk(): Promise<void> {
  if (sdkLoaded) return Promise.resolve();
  if (sdkLoadingPromise) return sdkLoadingPromise;

  sdkLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "//libtl.com/sdk.js";
    script.async = true;
    script.dataset.zone = MONETAG_ZONE_ID;
    script.dataset.sdk = `show_${MONETAG_ZONE_ID}`;

    script.onload = () => {
      sdkLoaded = true;
      resolve();
    };
    script.onerror = () => {
      sdkLoadingPromise = null;
      reject(new Error("Monetag SDK load failed"));
    };

    document.head.appendChild(script);
  });

  return sdkLoadingPromise;
}

/**
 * `adType` distingue les deux formats Monetag : undefined = Rewarded
 * Interstitial (earn_coins), "pop" = Rewarded Popup (energy_refill). Même
 * shape de retour que useRewardAd pour pouvoir réutiliser RewardAdButton tel quel.
 */
function useMonetagAd(
  adType: "pop" | undefined,
  api: ApiClient,
  onCredited: (me: MeResponse) => void
) {
  const [status, setStatus] = useState<RewardAdStatus>("idle");

  useEffect(() => {
    loadMonetagSdk().catch(() => {});
  }, []);

  const watch = async () => {
    setStatus("watching");
    try {
      await loadMonetagSdk();
      if (!window.show_11369203) {
        throw new Error("monetag_unavailable");
      }
      await window.show_11369203(adType);
    } catch {
      // SDK indisponible / pub fermée : pas une vraie erreur à afficher en rouge.
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

export function useMonetagEarnCoins(api: ApiClient, onCredited: (me: MeResponse) => void) {
  return useMonetagAd(undefined, api, onCredited);
}

export function useMonetagEnergyRefill(api: ApiClient, onCredited: (me: MeResponse) => void) {
  return useMonetagAd("pop", api, onCredited);
}

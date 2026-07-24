import { useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "mm_cooldown:";

interface StoredCooldown {
  remainingSeconds: number;
  fetchedAtMs: number;
}

function readStored(key: string): StoredCooldown | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCooldown>;
    if (typeof parsed.remainingSeconds !== "number" || typeof parsed.fetchedAtMs !== "number") {
      return null;
    }
    return parsed as StoredCooldown;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: StoredCooldown) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage indisponible (navigation privée, quota plein...) — pas
    // grave, on dégrade simplement vers la valeur serveur telle quelle.
  }
}

/**
 * Cloudflare KV est éventuellement cohérent : une écriture (ex. cooldown
 * posé par un postback pub) peut prendre jusqu'à ~60s pour se propager entre
 * datacenters (doc officielle Cloudflare). Un reload juste après avoir
 * regardé une pub peut donc tomber sur un edge qui n'a pas encore reçu
 * l'écriture, et afficher "disponible" à tort.
 *
 * On combine la valeur serveur avec une prédiction locale (dernière valeur
 * connue, décomptée du temps écoulé depuis) et on garde la plus grande des
 * deux. Le serveur redevient seul juge dès que KV s'est propagé — les deux
 * finissent par converger, mais entre-temps le front ne se fait plus piéger
 * par une lecture KV en retard.
 */
export function useStableCooldown(placementKey: string, serverValueSeconds: number): number {
  const [display, setDisplay] = useState(serverValueSeconds);
  const lastServerValue = useRef<number | null>(null);

  useEffect(() => {
    if (lastServerValue.current === serverValueSeconds) return;
    lastServerValue.current = serverValueSeconds;

    const now = Date.now();
    const stored = readStored(placementKey);
    const predicted = stored
      ? Math.max(0, stored.remainingSeconds - Math.floor((now - stored.fetchedAtMs) / 1000))
      : 0;

    const effective = Math.max(serverValueSeconds, predicted);
    setDisplay(effective);
    writeStored(placementKey, { remainingSeconds: effective, fetchedAtMs: now });
  }, [placementKey, serverValueSeconds]);

  return display;
}

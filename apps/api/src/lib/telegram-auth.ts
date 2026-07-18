import { timingSafeEqual } from "./security";

// Validation de l'initData envoyé par le WebApp SDK Telegram.
// Algorithme officiel : https://docs.telegram-mini-apps.com/platform/init-data
//   secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   hash       = HMAC_SHA256(key = secret_key,    data = data_check_string)
// Vérifié via recherche le 15/07/2026 — confirmé identique sur la doc officielle
// Telegram Mini Apps et plusieurs implémentations de référence (Python/C#/Node).

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  auth_date: number;
  start_param?: string;
}

async function hmacSha256(key: Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Valide la chaîne initData transmise par le client et retourne les données utilisateur
 * si la signature est correcte. Lève une erreur sinon (à traiter comme 401 côté route/middleware).
 *
 * @param maxAgeSeconds fraîcheur maximale de auth_date acceptée. Par défaut 6h
 * (21600s) — un compromis assumé : ce projet n'a PAS de token de session,
 * initData brut est réutilisé pour tous les appels d'une session de jeu
 * (voir middleware/auth.ts). Le réduire à quelques minutes casserait toute
 * partie qui dure plus longtemps que ça. La vraie façon d'avoir une fenêtre
 * courte SANS casser l'usage normal serait d'échanger initData contre un
 * token de session signé une fois pour toutes à l'entrée, puis de valider ce
 * token (pas l'initData brut) sur les appels suivants — pas fait ici,
 * changement d'architecture plus profond qu'un simple ajustement de valeur.
 * Configurable via INIT_DATA_MAX_AGE_SECONDS (wrangler.jsonc, vars).
 */
export async function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 21600
): Promise<ValidatedInitData> {
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN manquant côté serveur");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("initData invalide : hash manquant");
  params.delete("hash");

  const dataCheckString = [...params.keys()]
    .sort()
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const computedHash = bufToHex(await hmacSha256(new Uint8Array(secretKey), dataCheckString));

  if (!timingSafeEqual(computedHash, hash)) {
    throw new Error("initData invalide : signature incorrecte");
  }

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    throw new Error("initData expirée");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("initData invalide : champ user manquant");

  return {
    user: JSON.parse(userRaw) as TelegramUser,
    auth_date: authDate,
    start_param: params.get("start_param") ?? undefined,
  };
}

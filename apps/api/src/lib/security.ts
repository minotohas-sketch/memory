import type { MiddlewareHandler } from "hono";

/**
 * Comparaison à temps constant — évite qu'un attaquant déduise des infos
 * sur la valeur attendue via le temps de réponse. Implémentation maison
 * (pas node:crypto.timingSafeEqual : ce dernier jette une exception sur des
 * longueurs différentes plutôt que de renvoyer false, ce qui complique son
 * usage direct ici).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * En-têtes de sécurité pour les réponses JSON de l'API. Volontairement PAS
 * de X-Frame-Options/frame-ancestors restrictif ici : ces routes ne servent
 * pas de HTML embarquable, donc ça ne change rien niveau sécu, et on évite
 * tout risque d'appliquer un jour la même politique à du HTML qui devrait
 * pouvoir être encadré par Telegram (le frontend, lui, est servi séparément
 * par Cloudflare Pages — pas concerné par ce middleware).
 */
export const apiSecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Content-Security-Policy", "default-src 'none'");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
};

/**
 * En-têtes pour la page HTML /admin. Ici, contrairement à l'API JSON,
 * frame-ancestors 'none' est correct ET souhaitable : cette page ne doit
 * jamais être embarquable nulle part (protection anti-clickjacking d'un vrai
 * dashboard admin), et elle n'est pas chargée par Telegram (contrairement au
 * frontend du jeu, servi ailleurs).
 */
export const adminPageSecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // 'unsafe-inline' nécessaire : la page est un unique fichier HTML avec son
  // CSS/JS embarqué (pas de build séparé, voir admin-page.ts). Un CSP à base
  // de nonce serait plus strict mais demanderait de regénérer un nonce par
  // requête et de le injecter aux deux endroits — pas fait ici, disproportionné
  // pour un outil interne à un seul opérateur.
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"
  );
};

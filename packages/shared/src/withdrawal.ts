// Montants de départ — voir memory-match-spec.md §10, à ajuster selon ton
// eCPM Adsgram réel (le taux de conversion doit rester rentable).
export const COINS_PER_USDT = 10_000;
export const MIN_WITHDRAWAL_USDT = 1;
export const MIN_WITHDRAWAL_COINS = MIN_WITHDRAWAL_USDT * COINS_PER_USDT;

/** Arrondi vers le bas à 2 décimales — jamais en faveur de l'utilisateur. */
export function coinsToUsdt(coins: number): number {
  return Math.floor((coins / COINS_PER_USDT) * 100) / 100;
}

/** Combien de coins correspondent exactement à un montant USDT donné (pour savoir combien déduire). */
export function usdtToCoins(usdt: number): number {
  return Math.round(usdt * COINS_PER_USDT);
}

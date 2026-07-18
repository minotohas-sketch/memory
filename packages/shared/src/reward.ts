import type { LevelConfig } from "./levels";

// secondsLeft doit toujours venir du temps mesuré côté serveur pour un crédit
// réel (le serveur ne fait jamais confiance au temps déclaré par le client).
export function computeSpeedBonus(secondsLeft: number): number {
  return Math.round(Math.max(0, secondsLeft) * 1.5);
}

export function computeCoinsReward(level: LevelConfig, secondsLeft: number): number {
  return level.baseReward + computeSpeedBonus(secondsLeft);
}

export function computeXpReward(level: LevelConfig): number {
  return 10 * level.id;
}

// Courbe de niveau de compte — voir memory-match-spec.md §4.
export function xpNeededForLevel(accountLevel: number): number {
  return Math.round(100 * Math.pow(accountLevel, 1.5));
}

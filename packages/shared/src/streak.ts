export interface StreakTier {
  day: number;
  bonusCoins: number;
}

// Paliers de départ — voir memory-match-spec.md §4, à ajuster.
export const STREAK_TIERS: StreakTier[] = [
  { day: 3, bonusCoins: 50 },
  { day: 7, bonusCoins: 150 },
  { day: 30, bonusCoins: 750 },
];

export function getStreakBonus(streakCount: number): number {
  return STREAK_TIERS.find((t) => t.day === streakCount)?.bonusCoins ?? 0;
}

export function dateKeyUTC(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export interface StreakUpdate {
  streakCount: number;
  longestStreak: number;
  lastActiveDate: string;
  bonusCoins: number;
  streakChanged: boolean; // false si déjà comptabilisé aujourd'hui (appel idempotent)
}

/**
 * Calcule la mise à jour de streak pour "maintenant". Idempotent : si l'appelant
 * a déjà joué aujourd'hui, ne change rien et ne reverse aucun bonus une 2e fois.
 */
export function computeStreakUpdate(
  currentStreak: number,
  longestStreak: number,
  lastActiveDate: string | null,
  now: number
): StreakUpdate {
  const today = dateKeyUTC(now);

  if (lastActiveDate === today) {
    return { streakCount: currentStreak, longestStreak, lastActiveDate: today, bonusCoins: 0, streakChanged: false };
  }

  const yesterday = dateKeyUTC(now - 24 * 60 * 60 * 1000);
  const continuesStreak = lastActiveDate === yesterday;
  const streakCount = continuesStreak ? currentStreak + 1 : 1;
  const newLongest = Math.max(longestStreak, streakCount);

  return {
    streakCount,
    longestStreak: newLongest,
    lastActiveDate: today,
    bonusCoins: getStreakBonus(streakCount),
    streakChanged: true,
  };
}

export interface LevelConfig {
  id: number;
  name: string;
  cols: number;
  rows: number;
  pairs: number;
  timeLimitSeconds: number;
  baseReward: number;
}

// Barème de départ — voir memory-match-spec.md §3. Chiffres à ajuster selon
// l'économie réelle une fois Adsgram branché (Phase 4), pas figés.
export const LEVELS: LevelConfig[] = [
  { id: 1, name: "Facile", cols: 4, rows: 4, pairs: 8, timeLimitSeconds: 60, baseReward: 50 },
  { id: 2, name: "Moyen", cols: 5, rows: 4, pairs: 10, timeLimitSeconds: 75, baseReward: 90 },
  { id: 3, name: "Difficile", cols: 6, rows: 4, pairs: 12, timeLimitSeconds: 90, baseReward: 150 },
  { id: 4, name: "Expert", cols: 6, rows: 6, pairs: 18, timeLimitSeconds: 120, baseReward: 250 },
];

export function getLevel(id: number): LevelConfig | undefined {
  return LEVELS.find((l) => l.id === id);
}

// Un seul thème (fruits) sur les 4 niveaux pour une identité visuelle cohérente.
export const SYMBOL_POOL = [
  "🍎", "🍋", "🍇", "🍓", "🍉", "🍒", "🍑", "🥝",
  "🍍", "🥑", "🍌", "🍊", "🥭", "🍈", "🥥", "🫐",
  "🍐", "🍏",
];

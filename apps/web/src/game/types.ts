// LevelConfig vient désormais de @memory-match/shared (source unique avec le
// backend). Ce fichier ne garde que ce qui est purement un détail de rendu
// côté client.
export interface CardState {
  id: number; // position sur le plateau
  symbol: string; // emoji
  isFlipped: boolean;
  isMatched: boolean;
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { LevelConfig } from "@memory-match/shared";
import { SYMBOL_POOL } from "@memory-match/shared";
import type { CardState } from "./types";
import { ApiError, type ApiClient, type FinishGameResponse } from "../lib/api";

const FLIP_BACK_DELAY_MS = 700;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(level: LevelConfig): CardState[] {
  const symbols = SYMBOL_POOL.slice(0, level.pairs);
  return shuffle([...symbols, ...symbols]).map((symbol, id) => ({
    id,
    symbol,
    isFlipped: false,
    isMatched: false,
  }));
}

export type EnginePhase = "starting" | "playing" | "finishing" | "error";

export interface EngineError {
  code: string;
  friendlyMessage: string;
}

function toEngineError(err: unknown): EngineError {
  if (err instanceof ApiError) {
    if (err.message === "not_enough_energy") {
      return { code: err.message, friendlyMessage: "Plus assez d'énergie — attends qu'elle se régénère." };
    }
    return { code: err.message, friendlyMessage: "Le serveur a refusé la requête." };
  }
  return { code: "network_error", friendlyMessage: "Impossible de joindre le serveur." };
}

/**
 * `roundId` doit être incrémenté par l'appelant à chaque nouvelle partie
 * (sélection d'un niveau OU "rejouer"), même si `level` ne change pas — c'est
 * ce qui déclenche une nouvelle session serveur + un nouveau plateau.
 *
 * Le plateau est toujours généré côté client (comme à l'étape 2) : le serveur
 * ne transmet jamais la disposition des cartes, seulement une session qui sert
 * à valider le temps écoulé et empêcher un double crédit — voir apps/api
 * src/routes/game.ts pour le détail de la validation.
 */
export function useGameEngine(
  level: LevelConfig | null,
  roundId: number,
  api: ApiClient,
  onFinish: (result: FinishGameResponse) => void
) {
  const [cards, setCards] = useState<CardState[]>([]);
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [phase, setPhase] = useState<EnginePhase>("starting");
  const [error, setError] = useState<EngineError | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const finishedRef = useRef(false);

  // Ouvre une session serveur (dépense l'énergie) puis génère le plateau local.
  useEffect(() => {
    if (!level) return;
    let cancelled = false;
    finishedRef.current = false;
    sessionIdRef.current = null;
    setError(null);
    setPhase("starting");

    api
      .startGame(level.id)
      .then((res) => {
        if (cancelled) return;
        sessionIdRef.current = res.sessionId;
        setCards(buildDeck(level));
        setFlippedIds([]);
        setMoves(0);
        setMatchedCount(0);
        setSecondsLeft(level.timeLimitSeconds);
        setIsLocked(false);
        setPhase("playing");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toEngineError(err));
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, roundId]);

  const finish = useCallback(
    (won: boolean) => {
      if (finishedRef.current || !sessionIdRef.current) return;
      finishedRef.current = true;
      setPhase("finishing");
      api
        .finishGame({ sessionId: sessionIdRef.current, won, moves, matchedPairs: matchedCount })
        .then((res) => onFinish(res))
        .catch((err) => {
          setError(toEngineError(err));
          setPhase("error");
        });
    },
    [api, moves, matchedCount, onFinish]
  );

  // Compte à rebours — ne tourne que pendant la phase "playing".
  useEffect(() => {
    if (phase !== "playing") return;
    if (secondsLeft <= 0) {
      finish(false);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  const flipCard = useCallback(
    (id: number) => {
      if (phase !== "playing" || isLocked || flippedIds.length >= 2) return;
      const card = cards.find((c) => c.id === id);
      if (!card || card.isFlipped || card.isMatched) return;

      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, isFlipped: true } : c)));
      setFlippedIds((prev) => [...prev, id]);
    },
    [phase, isLocked, cards, flippedIds]
  );

  // Résolution d'une paire retournée.
  useEffect(() => {
    if (flippedIds.length !== 2) return;

    const [firstId, secondId] = flippedIds;
    const first = cards.find((c) => c.id === firstId);
    const second = cards.find((c) => c.id === secondId);
    const isMatch = Boolean(first && second && first.symbol === second.symbol);

    setIsLocked(true);
    setMoves((m) => m + 1);

    if (isMatch) {
      setCards((prev) =>
        prev.map((c) => (c.id === firstId || c.id === secondId ? { ...c, isMatched: true } : c))
      );
      setMatchedCount((count) => count + 1);
      setFlippedIds([]);
      setIsLocked(false);
      return;
    }

    const timeout = setTimeout(() => {
      setCards((prev) =>
        prev.map((c) => (c.id === firstId || c.id === secondId ? { ...c, isFlipped: false } : c))
      );
      setFlippedIds([]);
      setIsLocked(false);
    }, FLIP_BACK_DELAY_MS);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flippedIds]);

  // Victoire : toutes les paires trouvées avant la fin du temps.
  useEffect(() => {
    if (phase !== "playing" || !level) return;
    if (matchedCount > 0 && matchedCount === level.pairs) {
      finish(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCount, phase]);

  return { cards, flipCard, moves, matchedCount, secondsLeft, isLocked, phase, error };
}

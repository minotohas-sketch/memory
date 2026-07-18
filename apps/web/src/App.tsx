import { useCallback, useEffect, useMemo, useState } from "react";
import { useTelegram } from "./lib/useTelegram";
import { createApiClient, type MeResponse, type FinishGameResponse } from "./lib/api";
import { useAdsgram } from "./lib/useAdsgram";
import { LEVELS, type LevelConfig } from "@memory-match/shared";
import { useGameEngine } from "./game/useGameEngine";
import { LevelSelect } from "./components/LevelSelect";
import { GameBoard } from "./components/GameBoard";
import { ResultScreen } from "./components/ResultScreen";
import { Leaderboard } from "./components/Leaderboard";
import { ReferralScreen } from "./components/ReferralScreen";
import { TasksScreen } from "./components/TasksScreen";
import { WithdrawScreen } from "./components/WithdrawScreen";

type Screen = "select" | "playing" | "result" | "leaderboard" | "referral" | "tasks" | "withdraw";

// Cadence volontairement simple (compteur en mémoire, pas persisté) : un
// interstitiel toutes les 3 parties, affiché au retour vers la sélection de
// niveau plutôt que pile sur l'écran de résultat pour ne pas le télescoper.
const INTERSTITIAL_EVERY_N_GAMES = 3;

export default function App() {
  const { user, initData, isReady, haptic } = useTelegram();
  const api = useMemo(() => createApiClient(initData), [initData]);
  const interstitialAd = useAdsgram(import.meta.env.VITE_ADSGRAM_INTERSTITIAL_BLOCK_ID);

  const [screen, setScreen] = useState<Screen>("select");
  const [activeLevel, setActiveLevel] = useState<LevelConfig | null>(null);
  const [lastResult, setLastResult] = useState<FinishGameResponse | null>(null);
  const [roundId, setRoundId] = useState(0);
  const [gamesSinceInterstitial, setGamesSinceInterstitial] = useState(0);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    api
      .authTelegram()
      .then((res) => {
        if (!cancelled) setMe(res.user);
      })
      .catch(() => {
        if (!cancelled) {
          setBootError(
            "Impossible de se connecter au serveur. Vérifie que l'API tourne (pnpm run dev:api)."
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const handleFinish = useCallback(
    (result: FinishGameResponse) => {
      setLastResult(result);
      setMe(result.user);
      setScreen("result");
      if (result.won) haptic.match();
      else haptic.fail();
    },
    [haptic]
  );

  const { cards, flipCard, moves, matchedCount, secondsLeft, phase, error } = useGameEngine(
    screen === "playing" ? activeLevel : null,
    roundId,
    api,
    handleFinish
  );

  const handleSelectLevel = (level: LevelConfig) => {
    setActiveLevel(level);
    setRoundId((n) => n + 1);
    setScreen("playing");
  };

  const handleReplay = () => {
    setRoundId((n) => n + 1);
    setScreen("playing");
  };

  const handleFlip = (id: number) => {
    haptic.tap();
    flipCard(id);
  };

  const handleBackToLevels = () => {
    const next = gamesSinceInterstitial + 1;
    if (next >= INTERSTITIAL_EVERY_N_GAMES) {
      // Best-effort : si aucune pub n'est chargée (bloqueur, pas encore
      // modéré côté Adsgram...), on ignore simplement l'échec.
      interstitialAd.show().catch(() => {});
      setGamesSinceInterstitial(0);
    } else {
      setGamesSinceInterstitial(next);
    }
    setScreen("select");
  };

  if (!isReady || (!me && !bootError)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <p className="font-mono text-sage text-sm">Chargement…</p>
      </div>
    );
  }

  if (bootError || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink px-6 text-center">
        <p className="text-sage text-sm">{bootError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink">
      {screen === "select" && (
        <LevelSelect
          levels={LEVELS}
          onSelect={handleSelectLevel}
          onShowLeaderboard={() => setScreen("leaderboard")}
          onShowReferral={() => setScreen("referral")}
          onShowTasks={() => setScreen("tasks")}
          onShowWithdraw={() => setScreen("withdraw")}
          playerName={user.first_name}
          me={me}
          api={api}
          onMeUpdate={setMe}
        />
      )}

      {screen === "playing" && activeLevel && (
        <GameBoard
          level={activeLevel}
          cards={cards}
          secondsLeft={secondsLeft}
          matchedCount={matchedCount}
          moves={moves}
          phase={phase}
          error={error}
          onFlip={handleFlip}
          onBack={() => setScreen("select")}
        />
      )}

      {screen === "result" && lastResult && activeLevel && (
        <ResultScreen
          result={lastResult}
          level={activeLevel}
          onReplay={handleReplay}
          onBackToLevels={handleBackToLevels}
        />
      )}

      {screen === "leaderboard" && <Leaderboard api={api} onBack={() => setScreen("select")} />}

      {screen === "referral" && (
        <ReferralScreen referralCode={me.referral_code} onBack={() => setScreen("select")} />
      )}

      {screen === "tasks" && (
        <TasksScreen
          blockId={import.meta.env.VITE_ADSGRAM_TASK_BLOCK_ID}
          onBack={() => setScreen("select")}
          onCompleted={() => api.me().then(setMe).catch(() => {})}
        />
      )}

      {screen === "withdraw" && (
        <WithdrawScreen me={me} api={api} onBack={() => setScreen("select")} onMeUpdate={setMe} />
      )}
    </div>
  );
}

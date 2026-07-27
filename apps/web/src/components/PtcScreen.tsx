import { useState, useRef, useEffect } from "react";import type { ApiClient } from "../lib/api";

interface PtcTask {
  id: string;
  label: string;
  url: string;
}

const PTC_TASKS: PtcTask[] = [
  {
    id: "monetag_smartlink",
    label: "PTC",
    url: "https://ton-liens-monetag.com", // ⚠️ Remplace par ton vrai lien
  },
  {
    id: "adsterra_smartlink",
    label: "PTC",
    url: "https://ton-liens-adsterra.com", // ⚠️ Remplace par ton vrai lien
  },
];

interface Props {
  api: ApiClient;
  onBack: () => void;
}

type PtcStatus = "idle" | "starting" | "waiting" | "claiming" | "done" | "error";

export function PtcScreen({ api, onBack }: Props) {
  const [status, setStatus] = useState<PtcStatus>("idle");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [requiredSeconds, setRequiredSeconds] = useState(30);
  const [rewardCoins, setRewardCoins] = useState(50);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const popupRef = useRef<Window | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Nettoie au démontage
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
  }, []);

  // Compte à rebours du cooldown
  useEffect(() => {
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  const handleStart = async (task: PtcTask) => {
    if (status !== "idle") return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setActiveTaskId(task.id);
    setStatus("starting");

    try {
      // Étape 1 : demande un jeton au backend
      const res = await api.ptcStart(task.id);
      setToken(res.token);
      setRequiredSeconds(res.waitSeconds);
      setRewardCoins(res.rewardCoins);
      setTimer(res.waitSeconds);

      // Ouvre le lien
      popupRef.current = window.open(task.url, "_blank", "noopener,noreferrer");

      // Démarre le timer visuel
      setStatus("waiting");
      timerIntervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            // Le timer visuel est à 0, mais c'est le backend qui valide
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      if (err?.message === "rate_limited") {
        setErrorMsg("Tu as déjà fait un PTC récemment. Reviens dans 1 minute.");
        setCooldownSeconds(60);
      } else {
        setErrorMsg("Erreur lors du démarrage. Réessaie.");
      }
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const handleClaim = async () => {
    if (status !== "waiting" || !token) return;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setStatus("claiming");
    setErrorMsg(null);

    try {
      // Étape 2 : envoie le jeton au backend pour validation
      const res = await api.ptcClaim(token);
      setSuccessMsg(`✅ +${res.coinsEarned} coins gagnés !`);
      setStatus("done");
      setCooldownSeconds(60);

      // Ferme la popup
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      // Reset après 3s
      setTimeout(() => {
        setStatus("idle");
        setActiveTaskId(null);
        setToken(null);
        setTimer(0);
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      if (err?.message === "too_early") {
        // Le backend dit que c'est trop tôt — affiche le temps restant réel
        setErrorMsg(`Pas assez attendu ! Le serveur exige ${requiredSeconds}s. Réessaie.`);
        setStatus("waiting");
        // Relance le timer
        timerIntervalRef.current = setInterval(() => {
          setTimer((prev) => {
            if (prev <= 1) {
              if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (err?.message === "invalid_or_expired_token") {
        setErrorMsg("Session expirée. Recommence.");
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setErrorMsg("Erreur lors de la réclamation. Réessaie.");
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isCooldown = cooldownSeconds > 0;

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-24 max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Gagner des coins</h1>
        <button
          onClick={onBack}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-1"
        >
          ← Retour
        </button>
      </header>

      {/* Info */}
      <div className="text-xs text-sage bg-surface border border-surface-2 rounded-xl p-4">
        <p className="font-semibold text-cream mb-1">💡 Comment ça marche :</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Clique sur un lien ci-dessous</li>
          <li>Reste <span className="text-gold">{requiredSeconds} secondes</span> sur la page ouverte</li>
          <li>Reviens et clique sur <span className="text-gold">"Réclamer"</span></li>
        </ol>
        <p className="mt-2 text-coral">
          ⚠️ Le serveur vérifie le temps d'attente réel. Ne triche pas !
        </p>
      </div>

      {/* Timer actif */}
      {status === "waiting" && (
        <div className="rounded-2xl bg-gold/10 border border-gold/30 p-6 text-center">
          <p className="text-sm text-gold font-semibold mb-2">
            ⏳ Patiente sur la page ouverte…
          </p>
          <p className="font-mono text-4xl font-bold text-gold">
            {formatTime(timer)}
          </p>
          <p className="text-xs text-sage mt-3">
            Quand le timer atteint 0:00, clique sur le bouton ci-dessous
          </p>

          <button
            onClick={handleClaim}
            disabled={timer > 0}
            className={`mt-4 w-full rounded-xl py-3 font-bold text-sm transition-all active:scale-[0.98] ${
              timer > 0
                ? "bg-gold/30 text-gold/50 cursor-not-allowed"
                : "bg-gold text-ink hover:shadow-[0_0_16px_rgba(212,168,83,0.3)]"
            }`}
          >
            {timer > 0 ? `Encore ${formatTime(timer)}…` : "🎁 Réclamer mes coins"}
          </button>
        </div>
      )}

      {/* État claiming */}
      {status === "claiming" && (
        <div className="rounded-2xl bg-surface border border-surface-2 p-6 text-center">
          <p className="text-gold font-semibold animate-pulse">Vérification par le serveur…</p>
        </div>
      )}

      {/* Messages */}
      {errorMsg && (
        <div className="text-sm text-coral text-center bg-coral/10 border border-coral/30 rounded-xl px-4 py-3">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="text-sm text-mint text-center bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 animate-bounce">
          {successMsg}
        </div>
      )}

      {/* Cooldown global */}
      {isCooldown && status === "idle" && (
        <div className="text-sm text-sage text-center bg-surface border border-surface-2 rounded-xl px-4 py-3">
          ⏳ Prochain PTC disponible dans {formatTime(cooldownSeconds)}
        </div>
      )}

      {/* Liste des tâches */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs text-sage uppercase tracking-wider">Liens disponibles</h2>

        {PTC_TASKS.map((task) => {
          const isCurrentTask = activeTaskId === task.id;
          const isDisabled = status !== "idle" || isCooldown;

          return (
            <button
              key={task.id}
              onClick={() => handleStart(task)}
              disabled={isDisabled}
              className={`relative flex items-center justify-between rounded-2xl bg-surface border px-5 py-4 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isCurrentTask && status === "waiting"
                  ? "border-gold shadow-[0_0_12px_rgba(212,168,83,0.2)]"
                  : "border-surface-2"
              }`}
            >
              <div>
                <p className="font-semibold text-cream text-sm">{task.label}</p>
                <p className="text-xs text-sage mt-0.5">
                  {isCurrentTask && status === "waiting"
                    ? "En cours…"
                    : `${requiredSeconds}s · +${rewardCoins} coins`}
                </p>
              </div>
              <span className="text-xl">
                {isCurrentTask && status === "waiting" ? "⏳" : isCooldown ? "🔒" : "🔗"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
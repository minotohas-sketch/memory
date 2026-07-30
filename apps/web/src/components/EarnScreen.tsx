import { useState, useEffect } from "react";
import type { ApiClient, MeResponse } from "../lib/api";
import { useRewardAd } from "../lib/useRewardAd";
import { useMonetagEarnCoins } from "../lib/useMonetag";
import { useStableCooldown } from "../lib/useStableCooldown";
import { RewardAdButton } from "./RewardAdButton";

interface Props {
  api: ApiClient;
  me: MeResponse;
  onMeUpdate: (me: MeResponse) => void;
  onBack: () => void;
}

type EarnSection = "tasks" | "ptc" | "linktask" | "referral";

export function EarnScreen({ api, me, onMeUpdate, onBack }: Props) {
  const [section, setSection] = useState<EarnSection>("tasks");

  // Coins pub
  const adsgramCoins = useRewardAd(
    import.meta.env.VITE_ADSGRAM_BONUS_BLOCK_ID,
    api,
    onMeUpdate
  );
  const monetagCoins = useMonetagEarnCoins(api, onMeUpdate);

  const adsgramCoinsCooldown = useStableCooldown("bonus_coins", me.adCooldowns.bonus_coins ?? 0);
  const monetagCoinsCooldown = useStableCooldown("monetag_earn_coins", me.adCooldowns.monetag_earn_coins ?? 0);

  // Tâches pub
  const taskCooldown = useStableCooldown("task", me.adCooldowns.task ?? 0);

  // ============ PTC ============
  const [ptcToken, setPtcToken] = useState<string | null>(null);
  const [ptcTimer, setPtcTimer] = useState(0);
  const [ptcWait, setPtcWait] = useState(30);
  const [ptcReward, setPtcReward] = useState(50);
  const [ptcStatus, setPtcStatus] = useState<"idle" | "waiting" | "claiming" | "done">("idle");
  const [ptcError, setPtcError] = useState<string | null>(null);
  const [ptcSuccess, setPtcSuccess] = useState<string | null>(null);
  const [ptcCooldown, setPtcCooldown] = useState(0);

  // Compte à rebours du cooldown PTC
  useEffect(() => {
    if (ptcCooldown <= 0) return;
    const interval = setInterval(() => {
      setPtcCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [ptcCooldown]);

  const handlePtcStart = async () => {
    setPtcError(null);
    setPtcSuccess(null);
    try {
      const res = await api.ptcStart("ptc");
      setPtcToken(res.token);
      setPtcWait(res.waitSeconds);
      setPtcReward(res.rewardCoins);
      setPtcTimer(res.waitSeconds);
      setPtcStatus("waiting");
      window.open(res.url, "_blank", "noopener,noreferrer");

      const interval = setInterval(() => {
        setPtcTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      if (err?.message === "rate_limited") {
        setPtcError("PTC déjà fait aujourd'hui. Reviens demain !");
        setPtcCooldown(86400);
      } else {
        setPtcError("Erreur. Réessaie.");
      }
      setTimeout(() => setPtcError(null), 4000);
    }
  };

  const handlePtcClaim = async () => {
    if (!ptcToken) return;
    setPtcStatus("claiming");
    setPtcError(null);
    try {
      const res = await api.ptcClaim(ptcToken);
      setPtcSuccess(`+${res.coinsEarned} coins gagnés !`);
      setPtcStatus("done");
      setPtcCooldown(86400);
      api.me().then(onMeUpdate).catch(() => {});
      setTimeout(() => {
        setPtcStatus("idle");
        setPtcToken(null);
        setPtcTimer(0);
        setPtcSuccess(null);
      }, 4000);
    } catch (err: any) {
      if (err?.message === "too_early") {
        setPtcError("Pas assez attendu ! Réessaie.");
      } else {
        setPtcError("Erreur, réessaie.");
      }
      setPtcStatus("waiting");
      setTimeout(() => setPtcError(null), 3000);
    }
  };

  // ============ AUTRES ============

  // Tâche pub
  const handleTaskWatch = () => {
    const adsgram = (window as any).Adsgram;
    if (!adsgram) return;
    const blockId = import.meta.env.VITE_ADSGRAM_TASK_BLOCK_ID;
    adsgram.show({ blockId }).then(() => {
      api.me().then(onMeUpdate).catch(() => {});
    }).catch(() => {});
  };

  // Lien bonus
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const handleLinkTask = async () => {
    setLinkLoading(true);
    try {
      const res = await api.linkTaskStart();
      setLinkUrl(res.shortUrl);
      window.open(res.shortUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => {
        api.me().then(onMeUpdate).catch(() => {});
        setLinkUrl(null);
      }, 5000);
    } catch {
      // ignore
    } finally {
      setLinkLoading(false);
    }
  };

  // ============ FORMATS ============

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const formatTimeLong = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  // ============ TABS ============

  const tabs: { key: EarnSection; label: string; icon: string }[] = [
    { key: "tasks", label: "Pubs", icon: "📺" },
    { key: "ptc", label: "PTC", icon: "🔗" },
    { key: "linktask", label: "Lien", icon: "🌐" },
    { key: "referral", label: "Amis", icon: "👥" },
  ];

  // ============ RENDER ============

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-24 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Earn</h1>
        <button onClick={onBack} className="text-sm text-sage font-semibold">← Retour</button>
      </header>

      {/* Sous-navigation */}
      <div className="flex gap-1 bg-surface rounded-2xl p-1 border border-surface-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              section === tab.key ? "bg-gold text-ink" : "text-sage hover:text-cream"
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ============ SECTION PUBS ============ */}
      {section === "tasks" && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-sage bg-surface border border-surface-2 rounded-xl p-4">
            <p>Regarde une pub pour gagner des coins.</p>
          </div>
          <div className="flex gap-2.5">
            <RewardAdButton label="+30 coins" icon="🪙" status={adsgramCoins.status} onClick={adsgramCoins.watch} cooldownSeconds={adsgramCoinsCooldown} />
            <RewardAdButton label="+50 coins" icon="🪙" status={monetagCoins.status} onClick={monetagCoins.watch} cooldownSeconds={monetagCoinsCooldown} />
          </div>
          <button
            onClick={handleTaskWatch}
            disabled={taskCooldown > 0}
            className="rounded-2xl bg-surface border border-surface-2 px-5 py-4 text-left disabled:opacity-50"
          >
            <p className="text-cream font-semibold text-sm">📋 Tâche pub</p>
            <p className="text-xs text-sage mt-0.5">
              {taskCooldown > 0 ? `Dispo dans ${formatTime(taskCooldown)}` : "Regarde une pub → +coins"}
            </p>
          </button>
        </div>
      )}

      {/* ============ SECTION PTC ============ */}
      {section === "ptc" && (
        <div className="flex flex-col gap-4">
          {/* Info */}
          <div className="text-xs text-sage bg-surface border border-surface-2 rounded-xl p-4">
            <p className="font-semibold text-cream mb-1">💡 Gagner {ptcReward} coins</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Ouvre le lien</li>
              <li>Reste <span className="text-gold">{ptcWait} secondes</span> sur la page</li>
              <li>Reviens et clique sur <span className="text-gold">"Réclamer"</span></li>
            </ol>
            <p className="mt-2 text-xs text-sage/60">1 fois par jour · +{ptcReward} coins</p>
          </div>

          {/* Timer actif */}
          {ptcStatus === "waiting" && (
            <div className="rounded-2xl bg-gold/10 border border-gold/30 p-6 text-center">
              <p className="text-gold font-semibold mb-2">⏳ Patiente sur la page ouverte…</p>
              <p className="font-mono text-4xl font-bold text-gold">{formatTime(ptcTimer)}</p>
              <button
                onClick={handlePtcClaim}
                disabled={ptcTimer > 0}
                className={`mt-4 w-full rounded-xl py-3 font-bold text-sm transition-all active:scale-[0.98] ${
                  ptcTimer > 0
                    ? "bg-gold/30 text-gold/50 cursor-not-allowed"
                    : "bg-gold text-ink hover:shadow-[0_0_16px_rgba(212,168,83,0.3)]"
                }`}
              >
                {ptcTimer > 0 ? `Encore ${formatTime(ptcTimer)}…` : "🎁 Réclamer mes coins"}
              </button>
            </div>
          )}

          {/* Claiming */}
          {ptcStatus === "claiming" && (
            <div className="rounded-2xl bg-surface border border-surface-2 p-6 text-center">
              <p className="text-gold font-semibold animate-pulse">Vérification par le serveur…</p>
            </div>
          )}

          {/* Messages */}
          {ptcError && (
            <div className="text-sm text-coral text-center bg-coral/10 border border-coral/30 rounded-xl px-4 py-3">
              {ptcError}
            </div>
          )}
          {ptcSuccess && (
            <div className="text-sm text-mint text-center bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 animate-bounce">
              {ptcSuccess}
            </div>
          )}

          {/* Cooldown */}
          {ptcCooldown > 0 && ptcStatus === "idle" && (
            <div className="rounded-2xl bg-surface border border-surface-2 p-5 text-center">
              <p className="text-sage text-sm">⏳ Prochain PTC disponible dans</p>
              <p className="font-mono text-2xl font-bold text-gold mt-1">{formatTimeLong(ptcCooldown)}</p>
            </div>
          )}

          {/* Bouton principal */}
          {ptcStatus === "idle" && ptcCooldown === 0 && (
            <button
              onClick={handlePtcStart}
              className="rounded-2xl bg-gold text-ink font-bold py-4 text-center active:scale-[0.98] transition-transform hover:shadow-[0_0_16px_rgba(212,168,83,0.3)]"
            >
              🔗 Ouvrir le lien · +{ptcReward} coins
            </button>
          )}
        </div>
      )}

      {/* ============ SECTION LIEN BONUS ============ */}
      {section === "linktask" && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-sage bg-surface border border-surface-2 rounded-xl p-4">
            <p>Ouvre un lien partenaire et gagne des coins.</p>
          </div>
          <button
            onClick={handleLinkTask}
            disabled={linkLoading}
            className="rounded-2xl bg-surface border border-surface-2 px-5 py-4 text-left disabled:opacity-50"
          >
            <p className="text-cream font-semibold text-sm">🔗 Lien bonus</p>
            <p className="text-xs text-sage mt-0.5">
              {linkLoading ? "Chargement…" : linkUrl ? "Lien ouvert ! +coins" : "Ouvrir le lien"}
            </p>
          </button>
        </div>
      )}

      {/* ============ SECTION AMIS ============ */}
      {section === "referral" && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-sage bg-surface border border-surface-2 rounded-xl p-4">
            <p className="font-semibold text-cream mb-1">👥 Parraine tes amis</p>
            <p>Partage ton code et gagne des bonus quand ils jouent.</p>
          </div>
          <div className="rounded-2xl bg-surface border border-surface-2 p-5 text-center">
            <p className="text-xs text-sage mb-2">Ton code de parrainage</p>
            <p className="font-mono text-2xl font-bold text-gold tracking-widest">{me.referral_code}</p>
            <button
              onClick={() => navigator.clipboard.writeText(me.referral_code)}
              className="mt-3 text-xs text-gold underline"
            >
              📋 Copier le code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
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

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || "votre_bot";

export function EarnScreen({ api, me, onMeUpdate, onBack }: Props) {
  const [section, setSection] = useState<EarnSection>("tasks");

  // ============ PUBLICITÉS RÉCOMPENSÉES ============
  const adsgramCoins = useRewardAd(
    import.meta.env.VITE_ADSGRAM_BONUS_BLOCK_ID,
    api,
    onMeUpdate
  );
  const monetagCoins = useMonetagEarnCoins(api, onMeUpdate);

  const adsgramCoinsCooldown = useStableCooldown(
    "bonus_coins",
    me.adCooldowns.bonus_coins ?? 0
  );
  const monetagCoinsCooldown = useStableCooldown(
    "monetag_earn_coins",
    me.adCooldowns.monetag_earn_coins ?? 0
  );
  const taskCooldown = useStableCooldown("task", me.adCooldowns.task ?? 0);

  // ============ PTC ============
  const [ptcState, setPtcState] = useState({
    token: null as string | null,
    timer: 0,
    waitSeconds: 30,
    reward: 50,
    status: "idle" as "idle" | "waiting" | "claiming" | "done",
    error: null as string | null,
    success: null as string | null,
    cooldown: 0,
  });

  useEffect(() => {
    if (ptcState.cooldown <= 0) return;
    const interval = setInterval(() => {
      setPtcState((prev) => ({
        ...prev,
        cooldown: prev.cooldown > 1 ? prev.cooldown - 1 : 0,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [ptcState.cooldown]);

  const handlePtcStart = async () => {
    setPtcState((prev) => ({ ...prev, error: null, success: null }));
    try {
      const res = await api.ptcStart("ptc");
      setPtcState({
        token: res.token,
        waitSeconds: res.waitSeconds,
        reward: res.rewardCoins,
        timer: res.waitSeconds,
        status: "waiting",
        error: null,
        success: null,
        cooldown: 0,
      });
      window.open(res.url, "_blank", "noopener,noreferrer");

      const interval = setInterval(() => {
        setPtcState((prev) => {
          if (prev.timer <= 1) {
            clearInterval(interval);
            return { ...prev, timer: 0 };
          }
          return { ...prev, timer: prev.timer - 1 };
        });
      }, 1000);
    } catch (err: any) {
      const isRateLimited = err?.message === "rate_limited";
      setPtcState((prev) => ({
        ...prev,
        error: isRateLimited
          ? "PTC déjà effectué aujourd'hui. Revenez demain !"
          : "Erreur lors de l'ouverture du lien. Réessayez.",
        cooldown: isRateLimited ? 86400 : prev.cooldown,
      }));
      setTimeout(() => setPtcState((prev) => ({ ...prev, error: null })), 4000);
    }
  };

  const handlePtcClaim = async () => {
    if (!ptcState.token) return;
    setPtcState((prev) => ({ ...prev, status: "claiming", error: null }));
    try {
      const res = await api.ptcClaim(ptcState.token);
      setPtcState((prev) => ({
        ...prev,
        success: `+${res.coinsEarned} coins gagnés ! 🎉`,
        status: "done",
        cooldown: 86400,
      }));
      api.me().then(onMeUpdate).catch(() => {});
      setTimeout(() => {
        setPtcState({
          token: null,
          timer: 0,
          waitSeconds: 30,
          reward: 50,
          status: "idle",
          error: null,
          success: null,
          cooldown: 86400,
        });
      }, 4000);
    } catch (err: any) {
      setPtcState((prev) => ({
        ...prev,
        error:
          err?.message === "too_early"
            ? "Temps d'attente insuffisant. Continuez à patienter."
            : "Erreur lors de la réclamation. Réessayez.",
        status: "waiting",
      }));
      setTimeout(() => setPtcState((prev) => ({ ...prev, error: null })), 3000);
    }
  };

  // ============ TÂCHE PUBLICITAIRE ============
  const handleTaskWatch = () => {
    const adsgram = (window as any).Adsgram;
    if (!adsgram) return;
    const blockId = import.meta.env.VITE_ADSGRAM_TASK_BLOCK_ID;
    adsgram.show({ blockId }).then(() => {
      api.me().then(onMeUpdate).catch(() => {});
    }).catch(() => {});
  };

  // ============ LIEN BONUS ============
  const [linkState, setLinkState] = useState({
    loading: false,
    url: null as string | null,
  });

  const handleLinkTask = async () => {
    setLinkState({ loading: true, url: null });
    try {
      const res = await api.linkTaskStart();
      setLinkState({ loading: false, url: res.shortUrl });
      window.open(res.shortUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => {
        api.me().then(onMeUpdate).catch(() => {});
        setLinkState((prev) => ({ ...prev, url: null }));
      }, 5000);
    } catch {
      setLinkState({ loading: false, url: null });
    }
  };

  // ============ PARRAINAGE ============
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const referralLink = `https://t.me/${BOT_USERNAME}?start=${me.referral_code}`;
  const shareText = `🎮 Rejoins-moi sur Memory Match et gagne des récompenses !\n\n👉 ${referralLink}\n\nUtilise mon code : ${me.referral_code}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(me.referral_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleShare = () => {
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Rejoins-moi sur Memory Match ! 🎮")}`
      );
    } else {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  // ============ FORMATS ============
  const formatTimeShort = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const formatTimeLong = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s % 60}s`;
    return `${s}s`;
  };

  // ============ ONGLETS ============
  const tabs: { key: EarnSection; label: string; icon: string }[] = [
    { key: "tasks", label: "Publicités", icon: "📺" },
    { key: "ptc", label: "PTC", icon: "🔗" },
    { key: "linktask", label: "Lien bonus", icon: "🌐" },
    { key: "referral", label: "Parrainage", icon: "👥" },
  ];

  // ============ RENDER ============
  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-24 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Gagner des coins</h1>
        <button onClick={onBack} className="text-sm text-sage font-semibold hover:text-cream">← Retour</button>
      </header>

      <nav className="flex gap-1 bg-surface rounded-2xl p-1 border border-surface-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              section === tab.key ? "bg-gold text-ink shadow-sm" : "text-sage hover:text-cream"
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* SECTION PUBS */}
      {section === "tasks" && (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-surface-2 rounded-2xl p-4">
            <p className="text-cream font-semibold text-sm mb-1">📺 Regarder une publicité</p>
            <p className="text-xs text-sage">Visionnez une courte publicité pour gagner des coins instantanément.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RewardAdButton label="+30 coins" icon="🪙" status={adsgramCoins.status} onClick={adsgramCoins.watch} cooldownSeconds={adsgramCoinsCooldown} />
            <RewardAdButton label="+50 coins" icon="🪙" status={monetagCoins.status} onClick={monetagCoins.watch} cooldownSeconds={monetagCoinsCooldown} />
          </div>
          <button onClick={handleTaskWatch} disabled={taskCooldown > 0} className="rounded-2xl bg-surface border border-surface-2 px-5 py-4 text-left disabled:opacity-50 hover:border-gold/30">
            <p className="text-cream font-semibold text-sm">📋 Tâche sponsorisée</p>
            <p className="text-xs text-sage mt-0.5">{taskCooldown > 0 ? `Disponible dans ${formatTimeShort(taskCooldown)}` : "Regardez une publicité → +coins"}</p>
          </button>
        </div>
      )}

      {/* SECTION PTC */}
      {section === "ptc" && (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-surface-2 rounded-2xl p-4">
            <p className="text-cream font-semibold text-sm mb-2">💡 Gagner {ptcState.reward} coins</p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-sage">
              <li>Appuyez sur <span className="text-gold font-medium">"Ouvrir le lien"</span></li>
              <li>Restez <span className="text-gold font-medium">{ptcState.waitSeconds} secondes</span> sur la page</li>
              <li>Revenez et appuyez sur <span className="text-gold font-medium">"Réclamer"</span></li>
            </ol>
            <p className="mt-3 text-xs text-sage/60">⚠️ 1 fois par jour · +{ptcState.reward} coins</p>
          </div>

          {ptcState.status === "waiting" && (
            <div className="rounded-2xl bg-gold/10 border border-gold/30 p-6 text-center">
              <p className="text-gold font-semibold mb-3">⏳ Restez sur la page ouverte...</p>
              <p className="font-mono text-4xl font-bold text-gold">{formatTimeShort(ptcState.timer)}</p>
              <button onClick={handlePtcClaim} disabled={ptcState.timer > 0}
                className={`mt-4 w-full rounded-xl py-3 font-bold text-sm ${ptcState.timer > 0 ? "bg-gold/30 text-gold/50 cursor-not-allowed" : "bg-gold text-ink hover:shadow-lg active:scale-[0.98]"}`}>
                {ptcState.timer > 0 ? `Patientez ${formatTimeShort(ptcState.timer)}...` : "🎁 Réclamer mes coins"}
              </button>
            </div>
          )}

          {ptcState.status === "claiming" && (
            <div className="rounded-2xl bg-surface border border-surface-2 p-6 text-center">
              <p className="text-gold font-semibold animate-pulse">Vérification en cours...</p>
            </div>
          )}

          {ptcState.error && <div className="text-sm text-coral bg-coral/10 border border-coral/30 rounded-xl px-4 py-3 text-center">{ptcState.error}</div>}
          {ptcState.success && <div className="text-sm text-mint bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 text-center animate-bounce">{ptcState.success}</div>}

          {ptcState.cooldown > 0 && ptcState.status === "idle" && (
            <div className="rounded-2xl bg-surface border border-surface-2 p-5 text-center">
              <p className="text-sage text-sm">Prochain PTC disponible dans</p>
              <p className="font-mono text-2xl font-bold text-gold mt-1">{formatTimeLong(ptcState.cooldown)}</p>
            </div>
          )}

          {ptcState.status === "idle" && ptcState.cooldown === 0 && (
            <button onClick={handlePtcStart} className="rounded-2xl bg-gold text-ink font-bold py-4 text-center active:scale-[0.98] hover:shadow-lg">
              🔗 Ouvrir le lien · +{ptcState.reward} coins
            </button>
          )}
        </div>
      )}

      {/* SECTION LIEN BONUS */}
      {section === "linktask" && (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-surface-2 rounded-2xl p-4">
            <p className="text-cream font-semibold text-sm mb-2">🌐 Lien rémunéré</p>
            <p className="text-xs text-sage mb-3">Gagnez des pièces en visitant un lien sponsorisé.</p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-sage">
              <li>Appuyez sur "Ouvrir le lien"</li>
              <li>Le lien s'ouvre dans votre navigateur</li>
              <li>Suivez les instructions sur le site</li>
              <li>Revenez pour recevoir votre récompense</li>
            </ol>
            <p className="mt-3 text-xs text-sage/60">⚠️ Utilisez un navigateur externe (Chrome, Safari, Firefox).</p>
          </div>
          <button onClick={handleLinkTask} disabled={linkState.loading} className="rounded-2xl bg-surface border border-surface-2 px-5 py-4 text-left disabled:opacity-50 hover:border-gold/30">
            <p className="text-cream font-semibold text-sm">🔗 Lien bonus</p>
            <p className="text-xs text-sage mt-0.5">
              {linkState.loading ? "Chargement..." : linkState.url ? "✅ Lien ouvert ! Revenez." : "Ouvrir le lien"}
            </p>
          </button>
        </div>
      )}

      {/* SECTION PARRAINAGE */}
      {section === "referral" && (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-surface-2 rounded-2xl p-4">
            <p className="text-cream font-semibold text-sm mb-2">👥 Parrainez vos amis</p>
            <p className="text-xs text-sage">Partagez votre lien ou code de parrainage. Recevez des bonus quand vos amis rejoignent le jeu !</p>
          </div>

          {/* Code */}
          <div className="rounded-2xl bg-surface border border-surface-2 p-5 text-center">
            <p className="text-xs text-sage mb-3">Votre code</p>
            <p className="font-mono text-3xl font-bold text-gold tracking-widest select-all">{me.referral_code}</p>
            <button onClick={handleCopyCode} className="mt-4 inline-flex items-center gap-1.5 text-sm text-gold hover:text-cream">
              <span>{copiedCode ? "✅" : "📋"}</span>
              <span>{copiedCode ? "Copié !" : "Copier le code"}</span>
            </button>
          </div>

          {/* Lien complet */}
          <div className="rounded-2xl bg-surface border border-surface-2 p-5 text-center">
            <p className="text-xs text-sage mb-3">Votre lien</p>
            <div className="bg-ink/30 rounded-xl p-3 mb-3">
              <p className="text-xs text-sage break-all select-all">{referralLink}</p>
            </div>
            <button onClick={handleCopyLink} className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-cream">
              <span>{copiedLink ? "✅" : "🔗"}</span>
              <span>{copiedLink ? "Copié !" : "Copier le lien"}</span>
            </button>
          </div>

          {/* Bouton partage */}
          <button onClick={handleShare} className="rounded-2xl bg-gold text-ink font-bold py-4 text-center active:scale-[0.98] hover:shadow-lg flex items-center justify-center gap-2">
            <span>📤</span>
            <span>Partager avec des amis</span>
          </button>

          {/* Message pré-écrit */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-4">
            <p className="text-xs text-sage mb-2">💡 Copiez ce message pour vos amis :</p>
            <div className="bg-ink/30 rounded-xl p-3">
              <p className="text-xs text-sage whitespace-pre-wrap select-all">{shareText}</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(shareText)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-gold hover:text-cream">
              <span>📋</span>
              <span>Copier le message</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { ApiError, type ApiClient, type MeResponse } from "../lib/api";

interface Props {
  api: ApiClient;
  onBack: () => void;
  onMeUpdate: (me: MeResponse) => void;
}

export function LinkTaskScreen({ api, onBack, onMeUpdate }: Props) {
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [rewardCoins, setRewardCoins] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pas de postback ici (exe.io n'en fournit pas) : la seule façon de voir
  // une récompense arrivée pendant que l'utilisateur était sur son
  // navigateur externe, c'est de relire /api/me quand on revient dans l'app.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && shortUrl) {
        api.me().then(onMeUpdate).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [api, onMeUpdate, shortUrl]);

  const handleGenerate = async () => {
    setStatus("generating");
    setErrorMsg(null);
    try {
      const res = await api.linkTaskStart();
      setShortUrl(res.shortUrl);
      setRewardCoins(res.rewardCoins);
      setStatus("ready");
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "network_error";
      setErrorMsg(
        code === "rate_limited"
          ? "Tu as déjà généré un lien récemment — réessaie plus tard."
          : "Impossible de générer le lien pour l'instant."
      );
      setStatus("error");
    }
  };

  const handleOpen = () => {
    if (!shortUrl) return;
    // try_instant_view: false est important — sans ça Telegram peut ouvrir
    // le lien dans sa propre vue "Instant View" plutôt qu'un vrai navigateur
    // externe, ce qui casse tout le principe (les pubs d'exe.io ont besoin
    // d'un vrai navigateur pour se charger correctement).
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openLink(shortUrl, { try_instant_view: false });
    } else {
      window.open(shortUrl, "_blank");
    }
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Lien bonus</h1>
        <button
          onClick={onBack}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-1"
        >
          ← Retour
        </button>
      </header>

      <p className="text-sm text-sage">
        Ouvre le lien dans ton navigateur (Chrome, Safari…), suis les étapes jusqu'au bout, puis
        reviens sur cet écran.
        {rewardCoins ? ` Récompense : +${rewardCoins} coins.` : ""}
      </p>

      {!shortUrl && (
        <button
          onClick={handleGenerate}
          disabled={status === "generating"}
          className="rounded-xl bg-gold text-ink font-bold py-3.5 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft"
        >
          {status === "generating" ? "Génération…" : "Générer un lien"}
        </button>
      )}

      {shortUrl && (
        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleOpen}
            className="rounded-xl bg-gold text-ink font-bold py-3.5 active:scale-[0.98] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft"
          >
            Ouvrir le lien
          </button>
          <p className="text-xs text-sage text-center">
            Une fois terminé, reviens sur cet écran — ton solde se met à jour tout seul.
          </p>
        </div>
      )}

      {errorMsg && <p className="text-sm text-coral text-center">{errorMsg}</p>}
    </div>
  );
}

import { buildReferralStartParam, REFERRAL_SIGNUP_BONUS, REFERRAL_REFERRER_BONUS } from "@memory-match/shared";

interface Props {
  referralCode: string;
  onBack: () => void;
}

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "your_bot";
const APP_SHORTNAME = import.meta.env.VITE_TELEGRAM_APP_SHORTNAME || "app";

export function ReferralScreen({ referralCode, onBack }: Props) {
  const link = `https://t.me/${BOT_USERNAME}/${APP_SHORTNAME}?startapp=${buildReferralStartParam(referralCode)}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    "Rejoins-moi sur Memory Match, on gagne des coins tous les deux 👇"
  )}`;

  const handleShare = () => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // presse-papier indisponible (ex: contexte non sécurisé) — le lien reste affiché à l'écran
    }
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Inviter des amis</h1>
        <button
          onClick={onBack}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-1"
        >
          ← Retour
        </button>
      </header>

      <p className="text-sm text-sage">
        Ton ami reçoit <span className="text-gold font-semibold">{REFERRAL_SIGNUP_BONUS} coins</span> à
        l'inscription. Toi, tu reçois{" "}
        <span className="text-gold font-semibold">{REFERRAL_REFERRER_BONUS} coins</span> dès qu'il termine
        sa première partie.
      </p>

      <div className="rounded-xl bg-surface border border-surface-2 px-4 py-3 font-mono text-xs text-cream break-all">
        {link}
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          onClick={handleShare}
          className="rounded-xl bg-gold text-ink font-bold py-3.5 active:scale-[0.98] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft"
        >
          Partager sur Telegram
        </button>
        <button
          onClick={handleCopy}
          className="rounded-xl bg-transparent border border-surface-2 text-cream font-semibold py-3.5 active:scale-[0.98] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Copier le lien
        </button>
      </div>
    </div>
  );
}

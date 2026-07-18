import { useEffect, useState } from "react";
import {
  COINS_PER_USDT,
  MIN_WITHDRAWAL_COINS,
  MIN_WITHDRAWAL_USDT,
  coinsToUsdt,
  isValidTrc20Address,
} from "@memory-match/shared";
import { ApiError, type ApiClient, type MeResponse, type WithdrawalHistoryEntry } from "../lib/api";

interface Props {
  me: MeResponse;
  api: ApiClient;
  onBack: () => void;
  onMeUpdate: (me: MeResponse) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_address: "Indique une adresse.",
  invalid_address_format: 'Format inattendu — une adresse TRC20 commence par "T" et fait 34 caractères.',
  below_minimum: `Solde insuffisant — ${MIN_WITHDRAWAL_USDT} USDT minimum (${MIN_WITHDRAWAL_COINS} coins).`,
  invalid_faucetpay_address:
    "Cette adresse n'est pas liée à un compte FaucetPay. Vérifie-la dans FaucetPay → Linked Addresses.",
  balance_changed_retry: "Ton solde a changé entre-temps — réessaie.",
  rate_limited: "Trop de tentatives — réessaie dans quelques minutes.",
  network_error: "Impossible de joindre le serveur.",
};

const STATUS_LABEL: Record<WithdrawalHistoryEntry["status"], string> = {
  pending: "En attente du lundi",
  queued: "En file d'attente",
  processing: "En cours d'envoi",
  paid: "Payé",
  failed: "Échoué (coins remboursés)",
};

const STATUS_COLOR: Record<WithdrawalHistoryEntry["status"], string> = {
  pending: "text-sage",
  queued: "text-sage",
  processing: "text-gold",
  paid: "text-mint",
  failed: "text-coral",
};

export function WithdrawScreen({ me, api, onBack, onMeUpdate }: Props) {
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<WithdrawalHistoryEntry[] | null>(null);

  useEffect(() => {
    api
      .withdrawHistory()
      .then((res) => setHistory(res.withdrawals))
      .catch(() => setHistory([]));
  }, [api]);

  const usdtAmount = coinsToUsdt(me.coins);
  const canWithdraw = me.coins >= MIN_WITHDRAWAL_COINS;
  const trimmedAddress = address.trim();
  const addressLooksValid = trimmedAddress.length === 0 || isValidTrc20Address(trimmedAddress);

  const handleSubmit = async () => {
    if (!trimmedAddress || !isValidTrc20Address(trimmedAddress) || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.requestWithdraw(address.trim());
      const freshMe = await api.me();
      onMeUpdate(freshMe);
      setAddress("");
      setSuccessMsg(`Demande enregistrée : ${res.usdtAmount} USDT, payé lundi prochain.`);
      const historyRes = await api.withdrawHistory();
      setHistory(historyRes.withdrawals);
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "network_error";
      setErrorMsg(ERROR_MESSAGES[code] ?? "Une erreur est survenue.");
    }
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-cream">Retirer</h1>
        <button
          onClick={onBack}
          className="text-sm text-sage font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg px-2 py-1"
        >
          ← Retour
        </button>
      </header>

      <div className="rounded-2xl bg-surface border border-surface-2 p-5 flex flex-col gap-1">
        <span className="text-xs text-sage uppercase tracking-wider">Disponible</span>
        <span className="font-mono text-3xl font-bold text-gold">{usdtAmount.toFixed(2)} USDT</span>
        <span className="text-xs text-sage">{me.coins} coins · {COINS_PER_USDT.toLocaleString()} coins = 1 USDT</span>
      </div>

      <p className="text-xs text-sage">
        Paiement en USDT (réseau TRC-20) via FaucetPay, chaque lundi à 00:00 UTC. Ton adresse doit être{" "}
        <span className="text-cream">liée à un compte FaucetPay</span> au préalable (FaucetPay → Linked
        Addresses → Tether TRC20).
      </p>

      {!canWithdraw && (
        <p className="text-sm text-coral bg-coral/10 border border-coral/30 rounded-xl px-4 py-3">
          Il te faut au moins {MIN_WITHDRAWAL_USDT} USDT ({MIN_WITHDRAWAL_COINS} coins) pour retirer.
        </p>
      )}

      {canWithdraw && (
        <div className="flex flex-col gap-2.5">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Adresse USDT-TRC20 liée à FaucetPay"
            className={`rounded-xl bg-surface border px-4 py-3 text-sm text-cream font-mono placeholder:text-sage/50 focus:outline-none ${
              addressLooksValid ? "border-surface-2 focus:border-gold" : "border-coral"
            }`}
          />
          {!addressLooksValid && (
            <p className="text-xs text-coral">Format inattendu — une adresse TRC20 commence par "T" et fait 34 caractères.</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={!trimmedAddress || !addressLooksValid || submitting}
            className="rounded-xl bg-gold text-ink font-bold py-3.5 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft"
          >
            {submitting ? "Vérification…" : "Demander le retrait"}
          </button>
        </div>
      )}

      {errorMsg && <p className="text-sm text-coral text-center">{errorMsg}</p>}
      {successMsg && <p className="text-sm text-mint text-center">{successMsg}</p>}

      {history && history.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <h2 className="text-xs text-sage uppercase tracking-wider">Historique</h2>
          {history.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-xl bg-surface border border-surface-2 px-4 py-3"
            >
              <div>
                <p className="font-mono text-sm text-cream">{w.usdt_amount.toFixed(2)} USDT</p>
                <p className="text-xs text-sage">{new Date(w.requested_at).toLocaleDateString("fr-FR")}</p>
              </div>
              <span className={`text-xs font-semibold ${STATUS_COLOR[w.status]}`}>{STATUS_LABEL[w.status]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

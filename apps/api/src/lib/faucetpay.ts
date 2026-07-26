/**
 * Intégration FaucetPay — voir memory-match-spec.md §6.
 *
 * ⚠️ IMPORTANT — 2 valeurs ci-dessous n'ont pas pu être confirmées à 100 % :
 * leur page de doc (faucetpay.io/page/api-documentation) est une SPA rendue
 * en JS, illisible par mes outils de recherche. Ce que j'ai pu confirmer par
 * recherche (endpoint /pay, paramètres, codes d'erreur 456/402, et le fait
 * que leur endpoint balance renvoie du BTC en satoshis) laisse penser que ces
 * valeurs sont correctes, mais VÉRIFIE-les toi-même avant le premier vrai
 * paiement (2 minutes, voir README section Phase 5) :
 *
 * 1. FAUCETPAY_CURRENCY_CODE : appelle listCurrencies et cherche le code
 *    correspondant à "Tether TRC20 (USDT)" dans currencies_names.
 * 2. FAUCETPAY_SMALLEST_UNIT_MULTIPLIER : appelle balance avec ce currency
 *    code, compare le champ brut au champ lisible (comme "balance" vs
 *    "balance_bitcoin" pour BTC) pour en déduire le vrai multiplicateur.
 *
 * Tant que ce n'est pas vérifié, teste avec un tout petit montant vers ton
 * propre compte avant de faire confiance au batch automatique du lundi.
 */

const FAUCETPAY_API_BASE = "https://faucetpay.io/api/v1";

export const FAUCETPAY_CURRENCY_CODE = "USDTTRC20"; // ⚠️ à vérifier, voir ci-dessus
export const FAUCETPAY_SMALLEST_UNIT_MULTIPLIER = 100_000_000; // ⚠️ à vérifier, voir ci-dessus

function usdtToFaucetPayAmount(usdt: number): string {
  return Math.round(usdt * FAUCETPAY_SMALLEST_UNIT_MULTIPLIER).toString();
}

interface FaucetPayRawResponse {
  status: number;
  message?: string;
  payout_id?: string | number;
  [key: string]: unknown;
}

async function faucetPayRequest(path: string, params: Record<string, string>): Promise<FaucetPayRawResponse> {
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    form.append(key, value);
  }
  const res = await fetch(`${FAUCETPAY_API_BASE}${path}`, { method: "POST", body: form });
  return res.json();
}

/** À appeler quand l'utilisateur SOUMET son adresse, pas seulement le jour du batch (spec §6). */
export async function checkFaucetPayAddress(
  apiKey: string,
  address: string,
  currency: string = FAUCETPAY_CURRENCY_CODE
): Promise<boolean> {
  const data = await faucetPayRequest("/checkaddress", { api_key: apiKey, address, currency });
  return data.status === 200;
}

export interface FaucetPayPayResult {
  ok: boolean;
  payoutId?: string;
  errorCode?: number;
  errorMessage?: string;
}

export async function sendFaucetPayPayment(
  apiKey: string,
  address: string,
  usdtAmount: number,
  currency: string = FAUCETPAY_CURRENCY_CODE
): Promise<FaucetPayPayResult> {
  const data = await faucetPayRequest("/pay", {
    api_key: apiKey,
    to: address,
    amount: usdtToFaucetPayAmount(usdtAmount),
    currency,
    referral: "false", // programme de parrainage FaucetPay, pas le nôtre
  });

  if (data.status === 200) {
    return { ok: true, payoutId: data.payout_id !== undefined ? String(data.payout_id) : undefined };
  }
  return { ok: false, errorCode: data.status, errorMessage: data.message };
}

export interface FaucetPayBalanceResult {
  ok: boolean;
  rawBalance?: string;
  currency: string;
  errorMessage?: string;
}

/** Utilisé par le panel admin pour surveiller le solde avant qu'il ne bloque des paiements. */
export async function getFaucetPayBalance(
  apiKey: string,
  currency: string = FAUCETPAY_CURRENCY_CODE
): Promise<FaucetPayBalanceResult> {
  const data = await faucetPayRequest("/balance", { api_key: apiKey, currency });
  if (data.status === 200 && typeof data.balance === "string") {
    return { ok: true, rawBalance: data.balance, currency };
  }
  return { ok: false, currency, errorMessage: data.message };
}

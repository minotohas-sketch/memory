const FAUCETPAY_API_BASE = "https://faucetpay.io/api/v1";

// USDT no eken'ny API an'ny FaucetPay matetika ho an'ny TRC20
export const FAUCETPAY_CURRENCY_CODE = "USDT"; 
export const FAUCETPAY_SMALLEST_UNIT_MULTIPLIER = 100_000_000; 

function usdtToFaucetPayAmount(usdt: number): string {
  return Math.round(usdt * FAUCETPAY_SMALLEST_UNIT_MULTIPLIER).toString();
}

interface FaucetPayRawResponse {
  status: number;
  message?: string;
  payout_id?: string | number;
  balance?: string;
  [key: string]: unknown;
}

// Fanamarinana sy fitantanana ny valiny avy any amin'ny FaucetPay (misoroka ny crash raha HTML no mivoaka)
async function faucetPayRequest(path: string, params: Record<string, string>): Promise<FaucetPayRawResponse> {
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    form.append(key, value);
  }
  
  const res = await fetch(`${FAUCETPAY_API_BASE}${path}`, { method: "POST", body: form });
  
  try {
    return await res.json() as FaucetPayRawResponse;
  } catch (e) {
    const text = await res.text();
    console.error(`[FaucetPay] Erreur de parsing API sur ${path}. Reponse brute:`, text);
    return { status: 500, message: "Invalid API response format from FaucetPay" };
  }
}

export interface FaucetPayPayResult {
  ok: boolean;
  payoutId?: string;
  errorCode?: number;
  errorMessage?: string;
}

/**
 * Mandefa vola any amin'ny kaonty FaucetPay amin'ny alalan'ny Email.
 * ⚠️ Mitaky ny IP an'ilay mpampiasa (userIp) mba tsy holavin'ny FaucetPay.
 */
export async function sendFaucetPayPayment(
  apiKey: string,
  email: string,
  usdtAmount: number,
  userIp: string,
  currency: string = FAUCETPAY_CURRENCY_CODE
): Promise<FaucetPayPayResult> {
  
  // TSY MAINTSY /send fa TSY /pay (ny /pay dia miteraka erreur 404)
  const data = await faucetPayRequest("/send", {
    api_key: apiKey,
    to: email,
    amount: usdtToFaucetPayAmount(usdtAmount),
    currency,
    ip_address: userIp,
    referral: "false",
  });

  if (data.status === 200) {
    return { 
      ok: true, 
      payoutId: data.payout_id !== undefined ? String(data.payout_id) : undefined 
    };
  }
  
  console.error(`[FaucetPay Withdraw Error] Status: ${data.status}, Message: ${data.message}`);
  return { 
    ok: false, 
    errorCode: data.status, 
    errorMessage: data.message ?? "Erreur inconnue FaucetPay" 
  };
}

export interface FaucetPayBalanceResult {
  ok: boolean;
  rawBalance?: string;
  currency: string;
  errorMessage?: string;
}

/** 
 * Ampiasaina ao amin'ny Panel Admin hijerena ny solde misy ao amin'ny FaucetPay 
 * mialohan'ny handefasana batch.
 */
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

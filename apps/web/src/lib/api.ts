// URL de l'API : configurable via VITE_API_BASE_URL (voir .env.example),
// http://localhost:8787 par défaut pour le dev avec `pnpm run dev:api`.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, initData: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // Convention standard de l'écosystème Telegram Mini Apps
      // (docs.telegram-mini-apps.com/platform/init-data).
      Authorization: `tma ${initData}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message = typeof body.error === "string" ? body.error : `http_${res.status}`;
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

export interface MeResponse {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  coins: number;
  xp: number;
  account_level: number;
  energy: number;
  energy_max: number;
  streak_count: number;
  longest_streak: number;
  referral_code: string;
}

export interface StartGameResponse {
  sessionId: string;
  level: number;
  timeLimitSeconds: number;
  energy: number;
  energyMax: number;
}

export interface FinishGameResponse {
  won: boolean;
  coinsEarned: number;
  xpEarned: number;
  serverTimeTakenSeconds: number;
  streak: { count: number; bonusCoins: number };
  referralBonusPaid: boolean;
  user: MeResponse;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  coins: number;
  isMe: boolean;
}

export interface WithdrawResponse {
  withdrawalId: number;
  usdtAmount: number;
  status: string;
}

export interface WithdrawalHistoryEntry {
  id: number;
  usdt_amount: number;
  address: string;
  status: "pending" | "queued" | "processing" | "paid" | "failed";
  requested_at: number;
  paid_at: number | null;
  error: string | null;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(initData: string) {
  return {
    authTelegram: () =>
      apiFetch<{ user: MeResponse; isNewUser: boolean }>("/api/auth/telegram", initData, {
        method: "POST",
      }),
    me: () => apiFetch<MeResponse>("/api/me", initData),
    startGame: (level: number) =>
      apiFetch<StartGameResponse>("/api/game/start", initData, {
        method: "POST",
        body: JSON.stringify({ level }),
      }),
    finishGame: (payload: { sessionId: string; won: boolean; moves: number; matchedPairs: number }) =>
      apiFetch<FinishGameResponse>("/api/game/finish", initData, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    leaderboard: () => apiFetch<{ entries: LeaderboardEntry[] }>("/api/leaderboard", initData),
    requestWithdraw: (address: string) =>
      apiFetch<WithdrawResponse>("/api/withdraw", initData, {
        method: "POST",
        body: JSON.stringify({ address }),
      }),
    withdrawHistory: () =>
      apiFetch<{ withdrawals: WithdrawalHistoryEntry[] }>("/api/withdraw/history", initData),
  };
}

import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import {
  coinsToUsdt,
  usdtToCoins,
  isValidTrc20Address,
  MIN_WITHDRAWAL_USDT,
  MIN_WITHDRAWAL_COINS,
} from "@memory-match/shared";
import { checkFaucetPayAddress } from "../lib/faucetpay";
import { checkRateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const withdraw = new Hono<AuthEnv>();

const MAX_REQUESTS_PER_WINDOW = 3;
const WINDOW_SECONDS = 300; // 5 min — une vraie demande de retrait n'a jamais besoin d'être spammée

withdraw.post("/", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");

  const { allowed } = await checkRateLimit(
    c.env.GAME_KV,
    `withdraw:${tgUser.id}`,
    MAX_REQUESTS_PER_WINDOW,
    WINDOW_SECONDS
  );
  if (!allowed) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const body = await c.req.json<{ address?: string }>().catch(() => ({}) as { address?: string });
  const address = body.address?.trim() ?? "";

  if (!address) {
    return c.json({ error: "missing_address" }, 400);
  }
  // Validation de forme avant même d'appeler FaucetPay (rejette les entrées
  // absurdes/malveillantes gratuitement, sans consommer de quota API externe).
  if (!isValidTrc20Address(address)) {
    return c.json({ error: "invalid_address_format" }, 400);
  }

  const user = await c.env.DB.prepare("SELECT id, coins FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<{ id: number; coins: number }>();
  if (!user) return c.json({ error: "user_not_found" }, 404);

  const usdtAmount = coinsToUsdt(user.coins);
  if (usdtAmount < MIN_WITHDRAWAL_USDT) {
    return c.json({ error: "below_minimum", minCoins: MIN_WITHDRAWAL_COINS }, 400);
  }

  // Validé dès la demande, pas seulement le jour du batch (spec §6) : évite
  // de découvrir le problème le lundi et de devoir tout re-traiter.
  const addressValid = await checkFaucetPayAddress(c.env.FAUCETPAY_API_KEY, address);
  if (!addressValid) {
    return c.json({ error: "invalid_faucetpay_address" }, 400);
  }

  const coinsConsumed = usdtToCoins(usdtAmount);
  const now = Date.now();

  // Déduction atomique "compare-and-swap" : la clause AND coins >= ? garantit
  // qu'on ne déduit QUE si le solde lu à l'instant de l'écriture est encore
  // suffisant (protège contre 2 demandes quasi-simultanées, ex. 2 onglets).
  // meta.changes == 0 veut dire que la condition n'a pas matché : quelqu'un
  // d'autre (ou une autre requête) a changé le solde entre la lecture et
  // l'écriture — on rejette proprement plutôt que de risquer un solde négatif.
  const updateResult = await c.env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?")
    .bind(coinsConsumed, user.id, coinsConsumed)
    .run();

  if (!updateResult.meta.changes) {
    return c.json({ error: "balance_changed_retry" }, 409);
  }

  const created = await c.env.DB.prepare(
    `INSERT INTO withdrawals (user_id, coins_amount, usdt_amount, address, status, requested_at)
     VALUES (?, ?, ?, ?, 'pending', ?) RETURNING id`
  )
    .bind(user.id, coinsConsumed, usdtAmount, address, now)
    .first<{ id: number }>();

  await logAudit(c.env.DB, String(tgUser.id), "withdraw_requested", String(created?.id ?? ""), {
    usdtAmount,
    coinsConsumed,
  });

  return c.json({ withdrawalId: created?.id, usdtAmount, status: "pending" });
});

withdraw.get("/history", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<{ id: number }>();
  if (!user) return c.json({ error: "user_not_found" }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT id, usdt_amount, address, status, requested_at, paid_at, error
     FROM withdrawals WHERE user_id = ? ORDER BY requested_at DESC LIMIT 20`
  )
    .bind(user.id)
    .all();

  return c.json({ withdrawals: results });
});

export default withdraw;

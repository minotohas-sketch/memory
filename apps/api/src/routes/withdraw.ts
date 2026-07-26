import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import {
  coinsToUsdt,
  usdtToCoins,
  isValidFaucetPayEmail,
  MIN_WITHDRAWAL_USDT,
  MIN_WITHDRAWAL_COINS,
} from "@memory-match/shared";
import { checkRateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const withdraw = new Hono<AuthEnv>();

const MAX_REQUESTS_PER_WINDOW = 3;
const WINDOW_SECONDS = 300;

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

  if (!isValidFaucetPayEmail(address)) {
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

  // Pas de vérification FaucetPay ici : l'API /checkaddress ne fonctionne
  // qu'avec des adresses wallet (TRC20), pas avec des emails. Pour les
  // transferts internes par email (gratuits), la validation sera faite au
  // moment du batch le lundi. Si l'email n'existe pas, le paiement échoue
  // et les coins sont remboursés (status "failed").
  //
  // On garde juste la validation de forme côté serveur (isValidFaucetPayEmail)
  // pour rejeter les entrées manifestement invalides sans frais.

  const coinsConsumed = usdtToCoins(usdtAmount);
  const now = Date.now();

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
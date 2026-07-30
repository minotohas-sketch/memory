import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { checkRateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const ptc = new Hono<AuthEnv>();

const PTC_REWARD_COINS = 50;
const PTC_WAIT_SECONDS = 30;
const COOLDOWN_SECONDS = 86400; // 24 heures

// Liste des smartlinks
const SMARTLINKS = [
  "https://omg10.com/4/11454935",
  "https://omg10.com/4/11454936",
];

ptc.post("/start", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");

  const { allowed } = await checkRateLimit(
    c.env.GAME_KV,
    `ptc:${tgUser.id}`,
    1,
    COOLDOWN_SECONDS
  );
  if (!allowed) {
    return c.json({ error: "rate_limited", retryAfterSeconds: COOLDOWN_SECONDS }, 429);
  }

  // Choisit un smartlink aléatoire
  const url = SMARTLINKS[Math.floor(Math.random() * SMARTLINKS.length)];

  const token = crypto.randomUUID();
  const now = Date.now();

  await c.env.GAME_KV.put(
    `ptc_token:${token}`,
    JSON.stringify({
      userId: tgUser.id,
      startedAt: now,
    }),
    { expirationTtl: 120 }
  );

  return c.json({
    token,
    url,
    waitSeconds: PTC_WAIT_SECONDS,
    rewardCoins: PTC_REWARD_COINS,
  });
});

ptc.post("/claim", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");

  const body = await c.req.json<{ token?: string }>().catch(() => ({}));
  const token = body.token ?? "";

  if (!token) {
    return c.json({ error: "missing_token" }, 400);
  }

  const raw = await c.env.GAME_KV.get(`ptc_token:${token}`);
  if (!raw) {
    return c.json({ error: "invalid_or_expired_token" }, 400);
  }

  const session = JSON.parse(raw) as {
    userId: number;
    startedAt: number;
  };

  if (session.userId !== tgUser.id) {
    return c.json({ error: "token_user_mismatch" }, 403);
  }

  const elapsedMs = Date.now() - session.startedAt;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  if (elapsedSeconds < PTC_WAIT_SECONDS) {
    return c.json({
      error: "too_early",
      elapsedSeconds,
      requiredSeconds: PTC_WAIT_SECONDS,
      remainingSeconds: PTC_WAIT_SECONDS - elapsedSeconds,
    }, 400);
  }

  await c.env.GAME_KV.delete(`ptc_token:${token}`);

  const user = await c.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<{ id: number }>();
  if (!user) return c.json({ error: "user_not_found" }, 404);

  await c.env.DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?")
    .bind(PTC_REWARD_COINS, user.id)
    .run();

  await logAudit(c.env.DB, String(tgUser.id), "ptc_claimed", "ptc", {
    rewardCoins: PTC_REWARD_COINS,
    waitedSeconds: elapsedSeconds,
  });

  return c.json({ ok: true, coinsEarned: PTC_REWARD_COINS, waitedSeconds: elapsedSeconds });
});

export default ptc;
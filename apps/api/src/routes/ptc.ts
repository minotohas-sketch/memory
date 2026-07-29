import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { checkRateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const ptc = new Hono<AuthEnv>();

const PTC_REWARDS: Record<string, { coins: number; waitSeconds: number }> = {
  monetag_smartlink: { coins: 50, waitSeconds: 30 },
  adsterra_smartlink: { coins: 50, waitSeconds: 30 },
};

const COOLDOWN_SECONDS = 60;

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

  const body = await c.req.json<{ taskId?: string }>().catch(() => ({}));
  const taskId = body.taskId ?? "";

  if (!taskId || !(taskId in PTC_REWARDS)) {
    return c.json({ error: "invalid_task" }, 400);
  }

  const token = crypto.randomUUID();
  const now = Date.now();

  await c.env.GAME_KV.put(
    `ptc_token:${token}`,
    JSON.stringify({
      userId: tgUser.id,
      taskId,
      startedAt: now,
    }),
    { expirationTtl: 120 }
  );

  return c.json({
    token,
    waitSeconds: PTC_REWARDS[taskId].waitSeconds,
    rewardCoins: PTC_REWARDS[taskId].coins,
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
    taskId: string;
    startedAt: number;
  };

  if (session.userId !== tgUser.id) {
    return c.json({ error: "token_user_mismatch" }, 403);
  }

  const taskConfig = PTC_REWARDS[session.taskId];
  if (!taskConfig) {
    return c.json({ error: "unknown_task" }, 400);
  }

  const elapsedMs = Date.now() - session.startedAt;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  if (elapsedSeconds < taskConfig.waitSeconds) {
    return c.json({
      error: "too_early",
      elapsedSeconds,
      requiredSeconds: taskConfig.waitSeconds,
      remainingSeconds: taskConfig.waitSeconds - elapsedSeconds,
    }, 400);
  }

  await c.env.GAME_KV.delete(`ptc_token:${token}`);

  const reward = taskConfig.coins;

  const user = await c.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<{ id: number }>();
  if (!user) return c.json({ error: "user_not_found" }, 404);

  await c.env.DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?")
    .bind(reward, user.id)
    .run();

  await logAudit(c.env.DB, String(tgUser.id), "ptc_claimed", session.taskId, {
    rewardCoins: reward,
    waitedSeconds: elapsedSeconds,
  });

  return c.json({ ok: true, coinsEarned: reward, waitedSeconds: elapsedSeconds });
});

export default ptc;
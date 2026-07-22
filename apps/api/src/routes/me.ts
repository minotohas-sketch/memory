import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { applyRegen, MAX_ENERGY } from "../lib/energy";
import { MONETAG_COOLDOWN_MS } from "./monetag";

const me = new Hono<AuthEnv>();

interface UserRow {
  id: number;
  energy: number;
  energy_updated_at: number;
  [key: string]: unknown;
}

const AD_PLACEMENTS = [
  "energy_refill",
  "bonus_coins",
  "task",
] as const;

// Namespacés avec le préfixe "monetag_" pour ne pas entrer en collision avec
// les clés Adsgram ci-dessus ("energy_refill" existe des deux côtés, ce sont
// deux emplacements de pub distincts sur deux réseaux différents).
const MONETAG_PLACEMENTS = [
  "earn_coins",
  "energy_refill",
] as const;

me.get("/", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");

  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE telegram_id = ?"
  )
    .bind(tgUser.id)
    .first<UserRow>();

  if (!user) {
    return c.json({ error: "user_not_found" }, 404);
  }

  const now = Date.now();

  // Même logique de régénération que /api/game/start
  const { energy } = applyRegen(
    {
      energy: user.energy,
      energyUpdatedAt: user.energy_updated_at,
    },
    now
  );

  const nowSeconds = Math.floor(now / 1000);

  const adCooldowns: Record<string, number> = {};

  for (const placement of AD_PLACEMENTS) {
    const key = `ratelimit:ads:${placement}:${user.id}`;

    const value = await c.env.GAME_KV.get(key);

    if (!value) {
      adCooldowns[placement] = 0;
      continue;
    }

    const expiresAt = Number(value);

    if (!Number.isFinite(expiresAt)) {
      adCooldowns[placement] = 0;
      continue;
    }

    adCooldowns[placement] = Math.max(
      0,
      expiresAt - nowSeconds
    );
  }

  // Monetag : pas de KV ici, le cooldown vient de la dernière ligne dans
  // ad_rewards (table alimentée par routes/monetag.ts).
  for (const placement of MONETAG_PLACEMENTS) {
    const lastReward = await c.env.DB.prepare(
      "SELECT created_at FROM ad_rewards WHERE user_id = ? AND placement = ? ORDER BY created_at DESC LIMIT 1"
    )
      .bind(user.id, placement)
      .first<{ created_at: number }>();

    const remainingMs = lastReward
      ? MONETAG_COOLDOWN_MS - (now - lastReward.created_at)
      : 0;

    adCooldowns[`monetag_${placement}`] = Math.max(0, Math.round(remainingMs / 1000));
  }

  return c.json({
    ...user,
    energy,
    energy_max: MAX_ENERGY,
    adCooldowns,
  });
});

export default me;

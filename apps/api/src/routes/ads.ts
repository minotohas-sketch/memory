import { Hono } from "hono";
import { applyRegen, MAX_ENERGY } from "../lib/energy";

const ads = new Hono<{ Bindings: CloudflareBindings }>();

interface PlacementConfig {
  coins?: number;
  energy?: number;
  cooldownMinutes: number;
  transactionType?: string;
}

// Un placement = un Block Adsgram distinct (voir README pour la liste complète
// et comment construire leurs Reward URL). Montants de départ, à ajuster.
const PLACEMENTS: Record<string, PlacementConfig> = {
  energy_refill: {
    energy: 1,
    cooldownMinutes: 15,
  },
  bonus_coins: {
    coins: 30,
    cooldownMinutes: 30,
    transactionType: "ad_reward",
  },
  task: {
    coins: 40,
    cooldownMinutes: 360,
    transactionType: "task_reward",
  },
};

interface UserRow {
  id: number;
  energy: number;
  energy_updated_at: number;
}

/**
 * GET /api/ads/postback?userid=[userId]&secret=...&placement=...
 *
 * Appelé par les serveurs Adsgram eux-mêmes (pas par notre client).
 * C'est la SEULE source de vérité pour créditer une récompense.
 */
ads.get("/postback", async (c) => {
  const userIdParam = c.req.query("userid");
  const secret = c.req.query("secret");
  const placement = c.req.query("placement");

  if (
    !c.env.ADSGRAM_POSTBACK_SECRET ||
    secret !== c.env.ADSGRAM_POSTBACK_SECRET
  ) {
    console.error("adsgram postback: secret manquant ou invalide");
    return c.json({ ok: false }, 200);
  }

  const config = placement ? PLACEMENTS[placement] : undefined;

  if (!userIdParam || !config) {
    console.error(
      "adsgram postback: placement inconnu ou userid manquant",
      { placement, userIdParam }
    );
    return c.json({ ok: false }, 200);
  }

  const telegramId = Number(userIdParam);

  if (!Number.isFinite(telegramId)) {
    return c.json({ ok: false }, 200);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, energy, energy_updated_at FROM users WHERE telegram_id = ?"
  )
    .bind(telegramId)
    .first<UserRow>();

  if (!user) {
    console.error(
      "adsgram postback: utilisateur introuvable pour telegram_id",
      telegramId
    );
    return c.json({ ok: false }, 200);
  }

  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);

  // Adsgram ne fournit pas d'ID d'événement unique.
  // On applique donc un cooldown par utilisateur + placement.
  const rateLimitKey = `ratelimit:ads:${placement}:${user.id}`;

  const storedExpiry = await c.env.GAME_KV.get(rateLimitKey);

  if (storedExpiry) {
    const expiresAt = Number(storedExpiry);

    if (Number.isFinite(expiresAt) && expiresAt > nowSeconds) {
      return c.json(
        {
          ok: true,
          skipped: "cooldown",
          remaining: expiresAt - nowSeconds,
        },
        200
      );
    }
  }

  const cooldownSeconds = config.cooldownMinutes * 60;
  const expiresAt = nowSeconds + cooldownSeconds;

  await c.env.GAME_KV.put(
    rateLimitKey,
    String(expiresAt),
    {
      expirationTtl: cooldownSeconds,
    }
  );

  if (config.energy) {
    const { energy } = applyRegen(
      {
        energy: user.energy,
        energyUpdatedAt: user.energy_updated_at,
      },
      now
    );

    const newEnergy = Math.min(
      MAX_ENERGY,
      energy + config.energy
    );

    await c.env.DB.prepare(
      "UPDATE users SET energy = ?, energy_updated_at = ? WHERE id = ?"
    )
      .bind(newEnergy, now, user.id)
      .run();
  }

  if (config.coins) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE users SET coins = coins + ? WHERE id = ?"
      ).bind(config.coins, user.id),

      c.env.DB.prepare(
        `INSERT INTO transactions
        (user_id, type, amount, meta, created_at)
        VALUES (?, ?, ?, ?, ?)`
      ).bind(
        user.id,
        config.transactionType ?? "ad_reward",
        config.coins,
        JSON.stringify({ placement }),
        now
      ),
    ]);
  }

  return c.json({
    ok: true,
    cooldown: cooldownSeconds,
    expiresAt,
  });
});

export default ads;

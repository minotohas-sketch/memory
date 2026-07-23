import { Hono } from "hono";
import { applyRegen, MAX_ENERGY } from "../lib/energy";

const ads = new Hono<{ Bindings: CloudflareBindings }>();

interface PlacementConfig {
  coins?: number;
  energy?: number;
  cooldownMinutes: number;
  transactionType?: string;
}

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
 * Adsgram Reward URL
 *
 * Exemple:
 * /api/ads/postback?
 * userid=123456&
 * secret=xxx&
 * placement=bonus_coins
 *
 * IMPORTANT:
 * Le client ne crédite jamais.
 * Seul Adsgram -> backend no manao reward.
 */
ads.get("/postback", async (c) => {

  const telegramId = c.req.query("userid");
  const secret = c.req.query("secret");
  const placement = c.req.query("placement");


  if (
    !c.env.ADSGRAM_POSTBACK_SECRET ||
    secret !== c.env.ADSGRAM_POSTBACK_SECRET
  ) {
    console.error("Adsgram invalid secret");
    return c.json({ ok: false }, 200);
  }


  const config = placement
    ? PLACEMENTS[placement]
    : undefined;


  if (!telegramId || !config) {
    console.error("Adsgram invalid params", {
      telegramId,
      placement,
    });

    return c.json({
      ok:false,
      error:"invalid_params"
    },200);
  }


  const user = await c.env.DB.prepare(
    `
    SELECT 
      id,
      energy,
      energy_updated_at
    FROM users
    WHERE telegram_id = ?
    `
  )
  .bind(Number(telegramId))
  .first<UserRow>();


  if (!user) {
    return c.json({
      ok:false,
      error:"user_not_found"
    },200);
  }


  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);


  /**
   * Cooldown KV
   *
   * iray user + iray placement
   */
  const cooldownKey =
    `ratelimit:ads:${placement}:${user.id}`;


  const current =
    await c.env.GAME_KV.get(cooldownKey);


  if (current) {

    const expiresAt = Number(current);


    if (
      Number.isFinite(expiresAt) &&
      expiresAt > nowSeconds
    ) {

      return c.json({
        ok:false,
        reason:"cooldown",
        remaining:
          expiresAt - nowSeconds
      },200);

    }
  }



  const cooldownSeconds =
    config.cooldownMinutes * 60;


  await c.env.GAME_KV.put(
    cooldownKey,
    String(nowSeconds + cooldownSeconds),
    {
      expirationTtl: cooldownSeconds
    }
  );



  const queries = [];



  if (config.energy) {

    const regen = applyRegen(
      {
        energy:user.energy,
        energyUpdatedAt:user.energy_updated_at
      },
      now
    );


    const newEnergy =
      Math.min(
        MAX_ENERGY,
        regen.energy + config.energy
      );


    queries.push(
      c.env.DB.prepare(
        `
        UPDATE users
        SET energy=?,
            energy_updated_at=?
        WHERE id=?
        `
      )
      .bind(
        newEnergy,
        now,
        user.id
      )
    );
  }



  if (config.coins) {

    queries.push(

      c.env.DB.prepare(
        `
        UPDATE users
        SET coins = coins + ?
        WHERE id=?
        `
      )
      .bind(
        config.coins,
        user.id
      ),


      c.env.DB.prepare(
        `
        INSERT INTO transactions
        (
          user_id,
          type,
          amount,
          meta,
          created_at
        )
        VALUES (?,?,?,?,?)
        `
      )
      .bind(
        user.id,
        config.transactionType ??
        "ad_reward",
        config.coins,
        JSON.stringify({
          placement
        }),
        now
      )

    );
  }



  if (queries.length) {
    await c.env.DB.batch(queries);
  }



  return c.json({
    ok:true,
    placement,
    cooldownSeconds
  });

});


export default ads;

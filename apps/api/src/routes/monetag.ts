import { Hono } from "hono";
import { MAX_ENERGY, applyRegen } from "../lib/energy";
import { timingSafeEqual } from "../lib/security";

const monetag = new Hono<{
  Bindings: CloudflareBindings;
}>();

const COIN_REWARD = 50;
const ENERGY_REWARD = 3;

export const MONETAG_COOLDOWN_MS = 20 * 60 * 1000;

type Placement = "earn_coins" | "energy_refill";

interface UserRow {
  id: number;
  energy: number;
  energy_updated_at: number;
}


monetag.get("/postback", async (c) => {

  const secret = c.req.query("secret");

  if (
    !c.env.MONETAG_POSTBACK_SECRET ||
    !timingSafeEqual(
      secret ?? "",
      c.env.MONETAG_POSTBACK_SECRET
    )
  ) {
    console.error("monetag invalid secret");
    return c.text("OK", 200);
  }


  const telegramId = c.req.query("telegram_id");
  const ymid = c.req.query("ymid");
  const rewardType = c.req.query("reward_event_type");
  const placementParam = c.req.query("request_var");


  if (
    !telegramId ||
    !ymid ||
    !placementParam
  ) {
    return c.text("OK", 200);
  }


  if (
    rewardType !== "valued"
  ) {
    return c.text("OK", 200);
  }


  if (
    placementParam !== "earn_coins" &&
    placementParam !== "energy_refill"
  ) {
    return c.text("OK", 200);
  }


  const placement =
    placementParam as Placement;


  const tgId = Number(telegramId);

  if (!Number.isFinite(tgId)) {
    return c.text("OK",200);
  }



  const user =
    await c.env.DB.prepare(
`
SELECT 
 id,
 energy,
 energy_updated_at
FROM users
WHERE telegram_id = ?
`
    )
    .bind(tgId)
    .first<UserRow>();


  if (!user) {
    return c.text("OK",200);
  }



  // anti duplicate Monetag
  const duplicate =
    await c.env.DB.prepare(
`
SELECT id
FROM ad_rewards
WHERE event_id = ?
`
    )
    .bind(ymid)
    .first();


  if (duplicate) {
    return c.text("OK",200);
  }



  // cooldown
  const last =
    await c.env.DB.prepare(
`
SELECT created_at
FROM ad_rewards
WHERE user_id = ?
AND placement = ?
ORDER BY created_at DESC
LIMIT 1
`
    )
    .bind(
      user.id,
      placement
    )
    .first<{
      created_at:number
    }>();



  const now = Date.now();


  if (
    last &&
    now - last.created_at <
    MONETAG_COOLDOWN_MS
  ) {
    return c.text("OK",200);
  }



  const reward =
    placement === "earn_coins"
      ? COIN_REWARD
      : ENERGY_REWARD;



  const queries = [];



  queries.push(
    c.env.DB.prepare(
`
INSERT INTO ad_rewards
(
 user_id,
 event_id,
 placement,
 reward,
 created_at
)
VALUES(?,?,?,?,?)
`
    )
    .bind(
      user.id,
      ymid,
      placement,
      reward,
      now
    )
  );



  if (
    placement === "earn_coins"
  ) {


    queries.push(
      c.env.DB.prepare(
`
UPDATE users
SET coins = coins + ?
WHERE id = ?
`
      )
      .bind(
        COIN_REWARD,
        user.id
      )
    );


  } else {


    const regen =
      applyRegen(
        {
          energy:user.energy,
          energyUpdatedAt:user.energy_updated_at
        },
        now
      );


    const newEnergy =
      Math.min(
        MAX_ENERGY,
        regen.energy + ENERGY_REWARD
      );


    queries.push(
      c.env.DB.prepare(
`
UPDATE users
SET energy = ?,
energy_updated_at = ?
WHERE id = ?
`
      )
      .bind(
        newEnergy,
        now,
        user.id
      )
    );

  }



  await c.env.DB.batch(
    queries
  );



  return c.json({
    ok:true
  });

});


export default monetag;
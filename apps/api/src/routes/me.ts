import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { applyRegen, MAX_ENERGY } from "../lib/energy";
import { MONETAG_COOLDOWN_MS } from "./monetag";

const me = new Hono<AuthEnv>();


interface UserRow {
  id:number;
  energy:number;
  energy_updated_at:number;
  [key:string]: unknown;
}


// Adsgram placements
const ADSGRAM_PLACEMENTS = [
  "energy_refill",
  "bonus_coins",
  "task",
] as const;


// Monetag placements
const MONETAG_PLACEMENTS = [
  "earn_coins",
  "energy_refill",
] as const;



me.get(
"/",
telegramAuth,
async(c)=>{


  const tgUser =
    c.get("telegramUser");



  const user =
    await c.env.DB.prepare(
`
SELECT *
FROM users
WHERE telegram_id = ?
`
    )
    .bind(
      tgUser.id
    )
    .first<UserRow>();



  if(!user){

    return c.json(
      {
        error:"user_not_found"
      },
      404
    );

  }



  const now =
    Date.now();



  const regen =
    applyRegen(
      {
        energy:user.energy,
        energyUpdatedAt:user.energy_updated_at
      },
      now
    );



  const adCooldowns:
    Record<string,number> = {};



  /*
    ADSGRAM COOLDOWN
    Source = KV
  */

  for(
    const placement
    of ADSGRAM_PLACEMENTS
  ){

    const key =
      `ratelimit:ads:${placement}:${user.id}`;


    try {

      const value =
        await c.env.GAME_KV.get(key);



      if(!value){

        adCooldowns[placement]=0;
        continue;

      }



      const expiresAt =
        Number(value);



      if(
        !Number.isFinite(expiresAt)
      ){

        adCooldowns[placement]=0;
        continue;

      }



      const remaining =
        expiresAt -
        Math.floor(now/1000);



      adCooldowns[placement] =
        Math.max(
          0,
          remaining
        );


    } catch(err){

      console.error(
        "adsgram cooldown error",
        err
      );


      /*
        Raha KV misy problème:
        aza mamela hijery pub indray avy hatrany
        (anti abuse)
      */

      adCooldowns[placement]=60;

    }

  }




  /*
    MONETAG COOLDOWN
    Source = D1 ad_rewards
  */


  for(
    const placement
    of MONETAG_PLACEMENTS
  ){


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



    if(!last){

      adCooldowns[
        `monetag_${placement}`
      ] = 0;

      continue;

    }



    const remaining =
      MONETAG_COOLDOWN_MS -
      (
        now -
        last.created_at
      );



    adCooldowns[
      `monetag_${placement}`
    ] =
      Math.max(
        0,
        Math.floor(
          remaining / 1000
        )
      );

  }




  return c.json({

    ...user,


    energy:
      regen.energy,


    energy_max:
      MAX_ENERGY,


    adCooldowns

  });


});


export default me;
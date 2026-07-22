import { Hono } from "hono";
import { MAX_ENERGY } from "../lib/energy";
import { timingSafeEqual } from "../lib/security";

const monetag = new Hono<{ Bindings: CloudflareBindings }>();

const COIN_REWARD = 50;
const ENERGY_REWARD = 3;
export const MONETAG_COOLDOWN_MS = 20 * 60 * 1000;

type Placement = "earn_coins" | "energy_refill";

interface UserRow {
  id: number;
  energy: number;
  energy_updated_at: number;
}

/**
 * GET /api/monetag/postback
 *
 * ⚠️ Contrairement à Adsgram, Monetag ne propose PAS de signature/secret
 * intégré pour ce postback — leur doc officielle indique explicitement que
 * l'endpoint doit être "publicly accessible without authentication" de LEUR
 * côté. Ça ne veut pas dire qu'on ne peut pas se protéger nous-mêmes : comme
 * pour Adsgram, on écrit nous-mêmes l'URL de postback dans leur dashboard,
 * donc on peut y ajouter un paramètre "secret" statique qu'ils nous
 * renverront tel quel — Monetag n'a rien à faire de spécial pour ça, il leur
 * suffit de recopier l'URL qu'on leur donne. Sans ce secret, n'importe qui
 * connaissant un telegram_id pourrait générer des coins gratuits.
 *
 * On répond toujours 200 (même en cas de rejet), comme recommandé par leur
 * doc — un statut non-200 déclenche des retries de leur côté.
 */
monetag.get("/postback", async (c) => {
  const secret = c.req.query("secret");
  if (!c.env.MONETAG_POSTBACK_SECRET || !timingSafeEqual(secret ?? "", c.env.MONETAG_POSTBACK_SECRET)) {
    console.error("monetag postback: secret manquant ou invalide");
    return c.text("OK", 200);
  }

  const telegramId = c.req.query("telegram_id");
  const ymid = c.req.query("ymid");
  const rewardType = c.req.query("reward_event_type");
  const placementParam = c.req.query("request_var");

  // telegram_id peut être vide si Telegram ne l'a pas fourni pour cette
  // session (cas normal documenté par Monetag, pas forcément une attaque).
  if (!telegramId || !ymid || !placementParam) {
    return c.text("OK", 200);
  }

  if (rewardType !== "valued") {
    return c.text("OK", 200); // impression/clic non monétisé, pas un événement à créditer
  }

  if (placementParam !== "earn_coins" && placementParam !== "energy_refill") {
    return c.text("OK", 200);
  }
  const placement = placementParam as Placement;

  const user = await c.env.DB.prepare("SELECT id, energy, energy_updated_at FROM users WHERE telegram_id = ?")
    .bind(telegramId)
    .first<UserRow>();
  if (!user) return c.text("OK", 200);

  // Dédup : Monetag retente l'envoi si on ne répond pas 200, donc un même
  // événement peut arriver plusieurs fois — ymid identifie l'événement de
  // façon unique côté Monetag.
  const duplicate = await c.env.DB.prepare("SELECT id FROM ad_rewards WHERE event_id = ?").bind(ymid).first();
  if (duplicate) return c.text("OK", 200);

  const lastReward = await c.env.DB.prepare(
    "SELECT created_at FROM ad_rewards WHERE user_id = ? AND placement = ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(user.id, placement)
    .first<{ created_at: number }>();

  if (lastReward && Date.now() - lastReward.created_at < MONETAG_COOLDOWN_MS) {
    return c.text("OK", 200);
  }

  const now = Date.now();

  const statements = [
    c.env.DB.prepare(
      "INSERT INTO ad_rewards (user_id, event_id, placement, reward, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(user.id, ymid, placement, placement === "earn_coins" ? COIN_REWARD : ENERGY_REWARD, now),
  ];

  if (placement === "earn_coins") {
    statements.push(c.env.DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").bind(COIN_REWARD, user.id));
  } else {
    // energy_refill : on doit AUSSI avancer energy_updated_at, sinon le
    // calcul de régénération (applyRegen) recompterait ce temps une 2e fois
    // à la prochaine lecture — bug présent dans la version initiale de ce code.
    const newEnergy = Math.min(MAX_ENERGY, user.energy + ENERGY_REWARD);
    statements.push(
      c.env.DB.prepare("UPDATE users SET energy = ?, energy_updated_at = ? WHERE id = ?").bind(
        newEnergy,
        now,
        user.id
      )
    );
  }

  await c.env.DB.batch(statements);

  return c.text("OK", 200);
});

export default monetag;

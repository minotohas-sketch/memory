import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { applyRegen, MAX_ENERGY } from "../lib/energy";
import { REFERRAL_SIGNUP_BONUS, parseReferralCodeFromStartParam } from "@memory-match/shared";
import { checkRateLimit } from "../lib/rate-limit";

const auth = new Hono<AuthEnv>();

// Généreux par rapport à /api/withdraw : cet endpoint est appelé légitimement
// à chaque ouverture de l'app, pas juste sur une action ponctuelle.
const MAX_REQUESTS_PER_WINDOW = 20;
const WINDOW_SECONDS = 60;

// Volontairement simple (base36 de l'ID) — un vrai système peut vouloir un
// code plus court / plus joli, mais ça reste unique et stable.
function generateReferralCode(telegramId: number): string {
  return telegramId.toString(36);
}

interface UserRow {
  id: number;
  telegram_id: number;
  referral_code: string;
  energy: number;
  energy_updated_at: number;
  [key: string]: unknown;
}

// Même calcul que /api/me et /api/game/start : sans ça, un joueur qui revient
// après régénération verrait une énergie figée à sa valeur d'il y a longtemps.
function withFreshEnergy(user: UserRow) {
  const { energy } = applyRegen({ energy: user.energy, energyUpdatedAt: user.energy_updated_at }, Date.now());
  return { ...user, energy, energy_max: MAX_ENERGY };
}

auth.post("/telegram", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { allowed } = await checkRateLimit(c.env.GAME_KV, `auth:${ip}`, MAX_REQUESTS_PER_WINDOW, WINDOW_SECONDS);
  if (!allowed) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const startParam = c.get("startParam");
  const now = Date.now();

  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<UserRow>();

  if (existing) {
    return c.json({ user: withFreshEnergy(existing), isNewUser: false });
  }

  const referralCode = generateReferralCode(tgUser.id);
  let referredBy: number | null = null;

  // Rappel : pour les Mini Apps le payload arrive dans start_param via le lien
  // https://t.me/<bot>/<app>?startapp=ref_<code> — voir memory-match-spec.md §4.
  const referrerCode = parseReferralCodeFromStartParam(startParam);
  if (referrerCode) {
    const referrer = await c.env.DB.prepare("SELECT id FROM users WHERE referral_code = ?")
      .bind(referrerCode)
      .first<{ id: number }>();
    if (referrer?.id) referredBy = referrer.id;
  }

  const signupBonus = referredBy ? REFERRAL_SIGNUP_BONUS : 0;

  await c.env.DB.prepare(
    `INSERT INTO users (telegram_id, username, first_name, coins, energy, energy_updated_at, referral_code, referred_by, created_at)
     VALUES (?, ?, ?, ?, 5, ?, ?, ?, ?)`
  )
    .bind(tgUser.id, tgUser.username ?? null, tgUser.first_name, signupBonus, now, referralCode, referredBy, now)
    .run();

  const created = await c.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<UserRow>();

  if (!created) {
    return c.json({ error: "user_creation_failed" }, 500);
  }

  if (referredBy) {
    // Le bonus du FILLEUL est versé ici, immédiatement. Celui du PARRAIN attend
    // que ce nouvel utilisateur valide une vraie victoire (garde-fou anti-fraude,
    // voir apps/api/src/routes/game.ts).
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO referrals (referrer_id, referred_id, created_at) VALUES (?, ?, ?)`).bind(
        referredBy,
        created.id,
        now
      ),
      c.env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, meta, created_at) VALUES (?, 'referral_bonus', ?, ?, ?)`
      ).bind(created.id, signupBonus, JSON.stringify({ role: "referred_signup" }), now),
    ]);
  }

  return c.json({ user: withFreshEnergy(created), isNewUser: true });
});

export default auth;

import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { applyRegen, MAX_ENERGY } from "../lib/energy";

const me = new Hono<AuthEnv>();

interface UserRow {
  energy: number;
  energy_updated_at: number;
  [key: string]: unknown;
}

me.get("/", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<UserRow>();

  if (!user) {
    return c.json({ error: "user_not_found" }, 404);
  }

  // Même logique de régénération que /api/game/start, pour que la valeur
  // affichée ici et celle réellement dépensée au lancement d'une partie
  // ne divergent jamais.
  const { energy } = applyRegen(
    { energy: user.energy, energyUpdatedAt: user.energy_updated_at },
    Date.now()
  );

  return c.json({ ...user, energy, energy_max: MAX_ENERGY });
});

export default me;

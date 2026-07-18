import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";

const leaderboard = new Hono<AuthEnv>();

const CACHE_KEY = "leaderboard:weekly";
const CACHE_TTL_SECONDS = 60;

// Aligné sur le cycle de paiement hebdomadaire (lundi 00:00 UTC), voir spec §7.
function startOfWeekUTC(now: number): number {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0 = dimanche ... 6 = samedi
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

interface LeaderboardRow {
  id: number;
  username: string | null;
  first_name: string | null;
  weekly_coins: number;
}

leaderboard.get("/", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");

  const currentUser = await c.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<{ id: number }>();

  let entries = await c.env.GAME_KV.get<LeaderboardRow[]>(CACHE_KEY, "json");

  if (!entries) {
    const weekStart = startOfWeekUTC(Date.now());
    const { results } = await c.env.DB.prepare(
      `SELECT u.id as id, u.username as username, u.first_name as first_name,
              COALESCE(SUM(t.amount), 0) as weekly_coins
       FROM users u
       JOIN transactions t ON t.user_id = u.id
       WHERE t.type = 'game_reward' AND t.created_at >= ?
       GROUP BY u.id
       ORDER BY weekly_coins DESC
       LIMIT 20`
    )
      .bind(weekStart)
      .all<LeaderboardRow>();

    entries = results;
    await c.env.GAME_KV.put(CACHE_KEY, JSON.stringify(entries), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }

  const formatted = entries.map((row, i) => ({
    rank: i + 1,
    name: row.username ? `@${row.username}` : (row.first_name ?? "Joueur"),
    coins: row.weekly_coins,
    isMe: currentUser?.id === row.id,
  }));

  return c.json({ entries: formatted });
});

export default leaderboard;

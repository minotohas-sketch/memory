import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import {
  getLevel,
  computeCoinsReward,
  computeXpReward,
  xpNeededForLevel,
  computeStreakUpdate,
  REFERRAL_REFERRER_BONUS,
} from "@memory-match/shared";
import { spendEnergy, MAX_ENERGY } from "../lib/energy";

const game = new Hono<AuthEnv>();

interface UserRow {
  id: number;
  telegram_id: number;
  coins: number;
  xp: number;
  account_level: number;
  energy: number;
  energy_updated_at: number;
  streak_count: number;
  longest_streak: number;
  last_active_date: string | null;
  [key: string]: unknown;
}

interface StoredSession {
  userId: number;
  levelId: number;
  startedAt: number;
}

const SESSION_TTL_SECONDS = 60 * 20;
const TIME_BUFFER_SECONDS = 5;

function sessionKey(sessionId: string) {
  return `game-session:${sessionId}`;
}

game.post("/start", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");
  const body = await c.req.json<{ level?: number }>().catch(() => ({}) as { level?: number });
  const level = getLevel(body.level ?? -1);
  if (!level) {
    return c.json({ error: "invalid_level" }, 400);
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<UserRow>();
  if (!user) return c.json({ error: "user_not_found" }, 404);

  const now = Date.now();
  const spent = spendEnergy({ energy: user.energy, energyUpdatedAt: user.energy_updated_at }, now);
  if (!spent) {
    return c.json({ error: "not_enough_energy" }, 400);
  }

  await c.env.DB.prepare("UPDATE users SET energy = ?, energy_updated_at = ? WHERE id = ?")
    .bind(spent.energy, spent.energyUpdatedAt, user.id)
    .run();

  // Le serveur ne génère pas le plateau (le client le fait localement) : cette
  // session ne sert qu'à garantir un crédit unique et un temps plausible.
  const sessionId = crypto.randomUUID();
  const session: StoredSession = { userId: user.id, levelId: level.id, startedAt: now };
  await c.env.GAME_KV.put(sessionKey(sessionId), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return c.json({
    sessionId,
    level: level.id,
    timeLimitSeconds: level.timeLimitSeconds,
    energy: spent.energy,
    energyMax: MAX_ENERGY,
  });
});

game.post("/finish", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");
  const body = await c
    .req.json<{ sessionId?: string; won?: boolean; moves?: number; matchedPairs?: number }>()
    .catch(() => ({}) as { sessionId?: string; won?: boolean; moves?: number; matchedPairs?: number });

  if (!body.sessionId) return c.json({ error: "missing_session_id" }, 400);

  const raw = await c.env.GAME_KV.get(sessionKey(body.sessionId));
  if (!raw) {
    return c.json({ error: "session_not_found_or_expired" }, 400);
  }
  // Suppression immédiate : une session ne peut être validée qu'une seule fois.
  await c.env.GAME_KV.delete(sessionKey(body.sessionId));

  const session = JSON.parse(raw) as StoredSession;

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<UserRow>();
  if (!user || user.id !== session.userId) {
    return c.json({ error: "session_user_mismatch" }, 403);
  }

  const level = getLevel(session.levelId);
  if (!level) return c.json({ error: "invalid_level" }, 400);

  const now = Date.now();
  const serverElapsedSeconds = (now - session.startedAt) / 1000;
  const moves = Math.max(0, Math.min(Math.trunc(body.moves ?? 0), level.pairs * 6));
  const matchedPairs = Math.max(0, Math.min(Math.trunc(body.matchedPairs ?? 0), level.pairs));

  // Le serveur ne fait jamais confiance au "won" déclaré seul :
  const withinTimeLimit = serverElapsedSeconds <= level.timeLimitSeconds + TIME_BUFFER_SECONDS;
  const minPlausibleSeconds = level.pairs * 0.5;
  const plausiblySlowEnough = serverElapsedSeconds >= minPlausibleSeconds;
  const enoughMoves = moves >= level.pairs;
  const claimsCompletedGrid = Boolean(body.won) && matchedPairs === level.pairs;
  const won = claimsCompletedGrid && withinTimeLimit && plausiblySlowEnough && enoughMoves;

  let coinsEarned = 0;
  let xpEarned = 0;
  if (won) {
    const secondsLeft = Math.max(0, level.timeLimitSeconds - serverElapsedSeconds);
    coinsEarned = computeCoinsReward(level, secondsLeft);
    xpEarned = computeXpReward(level);
  }

  // Streak quotidien : compte toute partie terminée (victoire ou défaite), pas
  // seulement les victoires — voir memory-match-spec.md §4.
  const streakUpdate = computeStreakUpdate(user.streak_count, user.longest_streak, user.last_active_date, now);

  // Bonus parrain : versé sur la 1ère VRAIE victoire du filleul (pas juste un
  // "finish"), tant que ce parrainage n'a pas déjà été payé.
  let referrerBonusPaid = false;
  let referrerId: number | null = null;
  if (won) {
    const unpaidReferral = await c.env.DB.prepare(
      `SELECT referrer_id FROM referrals WHERE referred_id = ? AND bonus_paid = 0`
    )
      .bind(user.id)
      .first<{ referrer_id: number }>();
    if (unpaidReferral) {
      referrerId = unpaidReferral.referrer_id;
      referrerBonusPaid = true;
    }
  }

  const gameSessionId = crypto.randomUUID();
  const userCoinDelta = coinsEarned + streakUpdate.bonusCoins;

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO game_sessions (id, user_id, level, seed, started_at, completed_at, time_taken_ms, moves, status, coins_earned, xp_earned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      gameSessionId,
      user.id,
      level.id,
      body.sessionId, // référence d'audit vers la session KV (pas de génération de plateau serveur)
      session.startedAt,
      now,
      Math.round(serverElapsedSeconds * 1000),
      moves,
      won ? "won" : "lost",
      coinsEarned,
      xpEarned
    ),
    // Incréments relatifs plutôt que valeurs absolues recalculées en JS : plus
    // robuste si le joueur a l'app ouverte sur 2 appareils en même temps.
    c.env.DB.prepare(`UPDATE users SET coins = coins + ?, xp = xp + ? WHERE id = ?`).bind(
      userCoinDelta,
      xpEarned,
      user.id
    ),
  ];

  if (coinsEarned > 0) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, meta, created_at) VALUES (?, 'game_reward', ?, ?, ?)`
      ).bind(user.id, coinsEarned, JSON.stringify({ level: level.id, gameSessionId }), now)
    );
  }

  if (streakUpdate.streakChanged) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE users SET streak_count = ?, longest_streak = ?, last_active_date = ? WHERE id = ?`
      ).bind(streakUpdate.streakCount, streakUpdate.longestStreak, streakUpdate.lastActiveDate, user.id)
    );
    if (streakUpdate.bonusCoins > 0) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO transactions (user_id, type, amount, meta, created_at) VALUES (?, 'streak_bonus', ?, ?, ?)`
        ).bind(user.id, streakUpdate.bonusCoins, JSON.stringify({ streakCount: streakUpdate.streakCount }), now)
      );
    }
  }

  if (referrerBonusPaid && referrerId) {
    statements.push(
      c.env.DB.prepare(`UPDATE referrals SET bonus_paid = 1 WHERE referred_id = ?`).bind(user.id),
      c.env.DB.prepare(`UPDATE users SET coins = coins + ? WHERE id = ?`).bind(REFERRAL_REFERRER_BONUS, referrerId),
      c.env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, meta, created_at) VALUES (?, 'referral_bonus', ?, ?, ?)`
      ).bind(referrerId, REFERRAL_REFERRER_BONUS, JSON.stringify({ role: "referrer", referredUserId: user.id }), now)
    );
  }

  await c.env.DB.batch(statements);

  // Relecture pour renvoyer l'état exact (les deltas ont été appliqués en SQL,
  // pas recalculés en JS) — voir le commentaire sur les incréments relatifs.
  const updatedUser = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>();

  if (!updatedUser) {
    return c.json({ error: "user_reload_failed" }, 500);
  }

  let accountLevel = updatedUser.account_level;
  while (updatedUser.xp >= xpNeededForLevel(accountLevel)) {
    accountLevel += 1;
  }
  if (accountLevel !== updatedUser.account_level) {
    await c.env.DB.prepare("UPDATE users SET account_level = ? WHERE id = ?").bind(accountLevel, user.id).run();
    updatedUser.account_level = accountLevel;
  }

  return c.json({
    won,
    coinsEarned,
    xpEarned,
    serverTimeTakenSeconds: Math.round(serverElapsedSeconds),
    streak: { count: streakUpdate.streakCount, bonusCoins: streakUpdate.bonusCoins },
    referralBonusPaid: referrerBonusPaid,
    user: { ...updatedUser, energy_max: MAX_ENERGY },
  });
});

export default game;

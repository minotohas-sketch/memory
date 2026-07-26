import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { createExeioShortLink } from "../lib/exeio";
import { checkRateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const linkTask = new Hono<AuthEnv>();

const REWARD_COINS = 25; // volontairement plus modeste que Adsgram/Monetag — voir README
const COOLDOWN_SECONDS = 45 * 60;
// exe.io enchaîne plusieurs pages avec des comptes à rebours obligatoires —
// une vérification en dessous de ce seuil n'a presque aucune chance d'être
// honnête. Pas infaillible (un attaquant patient peut juste attendre), mais
// ça élimine le bypass instantané, le plus courant en pratique.
const MIN_PLAUSIBLE_SECONDS = 20;
const TOKEN_TTL_MS = 30 * 60 * 1000; // le lien expire s'il n'est pas utilisé

interface LinkTaskRow {
  id: string;
  user_id: number;
  status: string;
  created_at: number;
}

function htmlPage(title: string, message: string, botUsername: string | null): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body { background:#0b1f1a; color:#f3efe4; font-family:-apple-system,system-ui,sans-serif;
         min-height:100vh; margin:0; display:flex; align-items:center; justify-content:center;
         padding:24px; text-align:center; }
  .card { max-width:360px; }
  h1 { font-size:1.3rem; margin-bottom:12px; }
  p { color:#8fa79c; font-size:0.95rem; line-height:1.5; }
  a.button { display:inline-block; margin-top:20px; background:#e8b75e; color:#0b1f1a;
             font-weight:bold; padding:14px 28px; border-radius:12px; text-decoration:none; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    ${botUsername ? `<a class="button" href="https://t.me/${botUsername}">Retourner sur Telegram</a>` : ""}
  </div>
</body>
</html>`;
}

/** POST /api/link-task/start — génère un lien exe.io unique pour ce joueur. */
linkTask.post("/start", telegramAuth, async (c) => {
  const tgUser = c.get("telegramUser");

  const { allowed } = await checkRateLimit(
    c.env.GAME_KV,
    `link-task-start:${tgUser.id}`,
    1,
    COOLDOWN_SECONDS
  );
  if (!allowed) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const user = await c.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(tgUser.id)
    .first<{ id: number }>();
  if (!user) return c.json({ error: "user_not_found" }, 404);

  const token = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    "INSERT INTO link_tasks (id, user_id, status, created_at) VALUES (?, ?, 'pending', ?)"
  )
    .bind(token, user.id, now)
    .run();

  const destinationUrl = `${c.env.PUBLIC_API_URL}/api/link-task/verify?token=${token}`;
  const result = await createExeioShortLink(c.env.EXEIO_API_TOKEN, destinationUrl);

  if (!result.ok) {
    console.error("exe.io shorten failed", result.errorMessage);
    return c.json({ error: "exeio_unavailable" }, 502);
  }

  return c.json({ shortUrl: result.shortUrl, rewardCoins: REWARD_COINS });
});

/**
 * GET /api/link-task/verify — page publique (PAS de telegramAuth : l'utilisateur
 * est dans un navigateur externe, sans contexte Telegram/initData disponible).
 * Le token seul fait le lien vers l'utilisateur à créditer.
 */
linkTask.get("/verify", async (c) => {
  const token = c.req.query("token");
  const botUsername = c.env.TELEGRAM_BOT_USERNAME || null;

  if (!token) {
    return c.html(htmlPage("Lien invalide", "Ce lien n'est pas valide.", null), 400);
  }

  const task = await c.env.DB.prepare("SELECT * FROM link_tasks WHERE id = ?")
    .bind(token)
    .first<LinkTaskRow>();

  if (!task || task.status !== "pending") {
    return c.html(
      htmlPage(
        "Déjà utilisé",
        "Ce lien a déjà été validé ou n'existe plus. Retourne dans l'app pour en générer un nouveau.",
        botUsername
      ),
      200
    );
  }

  const now = Date.now();
  const elapsedSeconds = (now - task.created_at) / 1000;

  if (elapsedSeconds > TOKEN_TTL_MS / 1000) {
    await c.env.DB.prepare("UPDATE link_tasks SET status = 'expired' WHERE id = ?").bind(token).run();
    return c.html(
      htmlPage("Lien expiré", "Ce lien a expiré. Retourne dans l'app pour en générer un nouveau.", botUsername),
      200
    );
  }

  if (elapsedSeconds < MIN_PLAUSIBLE_SECONDS) {
    // Pas assez de temps écoulé pour avoir réellement traversé le parcours
    // exe.io — probable contournement direct du lien de destination.
    console.error("link-task: vérification trop rapide, probable bypass", { token, elapsedSeconds });
    await logAudit(c.env.DB, String(task.user_id), "link_task_rejected_too_fast", token, { elapsedSeconds });
    return c.html(
      htmlPage(
        "Pas si vite",
        "La validation est arrivée trop rapidement pour être honnête. Réessaie en suivant bien toutes les étapes.",
        botUsername
      ),
      200
    );
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE link_tasks SET status = 'verified', verified_at = ? WHERE id = ?").bind(now, token),
    c.env.DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").bind(REWARD_COINS, task.user_id),
    c.env.DB.prepare(
      "INSERT INTO transactions (user_id, type, amount, meta, created_at) VALUES (?, 'ad_reward', ?, ?, ?)"
    ).bind(task.user_id, REWARD_COINS, JSON.stringify({ placement: "link_task" }), now),
  ]);

  return c.html(
    htmlPage(
      "Récompense reçue ! 🎉",
      `+${REWARD_COINS} coins ont été ajoutés à ton compte. Retourne dans l'app pour les voir.`,
      botUsername
    ),
    200
  );
});

export default linkTask;

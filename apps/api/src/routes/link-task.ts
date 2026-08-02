import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { createExeioShortLink } from "../lib/exeio";
import { checkRateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const linkTask = new Hono<AuthEnv>();

const REWARD_COINS = 60; // volontairement plus modeste que Adsgram/Monetag — voir README
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

function htmlPage(
  title: string,
  message: string,
  botUsername: string | null,
  appName?: string
): string {
  // Construire le lien qui ouvre directement la Mini App
  let returnLink = "";
  if (botUsername && appName) {
    // Format: https://t.me/bot_username/app_name
    // Cela ouvre directement la Mini App dans Telegram
    returnLink = `https://t.me/${botUsername}/${appName}`;
  } else if (botUsername) {
    // Fallback: lien vers le bot avec commande start
    returnLink = `https://t.me/${botUsername}?start=return`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    background: linear-gradient(135deg, #0b1f1a 0%, #0d2b23 50%, #0b1f1a 100%);
    color: #f3efe4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
  }
  
  .card {
    max-width: 400px;
    width: 100%;
    background: rgba(26, 47, 40, 0.5);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(232, 183, 94, 0.2);
    border-radius: 20px;
    padding: 32px 24px;
    animation: fadeInUp 0.5s ease-out;
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .icon {
    font-size: 48px;
    margin-bottom: 16px;
    animation: bounce 0.6s ease-out;
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  
  h1 {
    font-size: 1.5rem;
    margin-bottom: 12px;
    color: #f3efe4;
    font-weight: 700;
  }
  
  p {
    color: #8fa79c;
    font-size: 0.95rem;
    line-height: 1.6;
    margin-bottom: 16px;
  }
  
  .reward {
    display: inline-block;
    background: rgba(232, 183, 94, 0.15);
    border: 1px solid rgba(232, 183, 94, 0.3);
    color: #e8b75e;
    padding: 8px 16px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 1.1rem;
    margin-bottom: 20px;
  }
  
  .info {
    background: rgba(15, 30, 24, 0.6);
    border: 1px solid rgba(143, 167, 156, 0.2);
    border-radius: 12px;
    padding: 16px;
    margin: 20px 0;
    font-size: 0.85rem;
    color: #8fa79c;
    text-align: left;
  }
  
  .info ol {
    margin: 8px 0 0 0;
    padding-left: 20px;
  }
  
  .info ol li {
    margin-bottom: 4px;
  }
  
  a.button {
    display: inline-block;
    margin-top: 16px;
    background: linear-gradient(135deg, #e8b75e 0%, #d4a853 100%);
    color: #0b1f1a;
    font-weight: 700;
    font-size: 1rem;
    padding: 14px 32px;
    border-radius: 14px;
    text-decoration: none;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(232, 183, 94, 0.3);
  }
  
  a.button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(232, 183, 94, 0.4);
  }
  
  a.button:active {
    transform: translateY(0);
  }
  
  .auto-redirect {
    font-size: 0.8rem;
    color: #8fa79c;
    margin-top: 16px;
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .footer {
    margin-top: 24px;
    font-size: 0.75rem;
    color: #5a7a6a;
  }
  
  .countdown {
    font-weight: 700;
    color: #e8b75e;
  }
</style>
${
  returnLink
    ? `<script>
  // Redirection automatique après 3 secondes avec compte à rebours
  let secondsLeft = 3;
  
  function updateCountdown() {
    var countdownEl = document.getElementById('countdown');
    if (countdownEl) {
      countdownEl.textContent = secondsLeft;
    }
    if (secondsLeft <= 0) {
      window.location.href = "${returnLink}";
    } else {
      secondsLeft--;
      setTimeout(updateCountdown, 1000);
    }
  }
  
  // Démarre le compte à rebours au chargement
  window.addEventListener('DOMContentLoaded', function() {
    setTimeout(updateCountdown, 500);
  });
</script>`
    : ""
}
</head>
<body>
  <div class="card">
    <div class="icon">${title.includes("Récompense") ? "🎉" : title.includes("expiré") ? "⏰" : title.includes("vite") ? "⚠️" : "❓"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${
      title.includes("Récompense") && message.includes("coins")
        ? `<div class="reward">+${REWARD_COINS} coins</div>`
        : ""
    }
    ${
      returnLink
        ? `
      <a class="button" href="${returnLink}">
        ${title.includes("Récompense") ? "🎮 Retourner au jeu" : "↩️ Retourner dans l'app"}
      </a>
      <p class="auto-redirect">
        Redirection automatique dans <span class="countdown" id="countdown">3</span> secondes...
      </p>
      <div class="info">
        <p style="margin:0 0 8px 0; font-weight:600;">💡 Si le bouton ne fonctionne pas :</p>
        <ol>
          <li>Retournez sur Telegram</li>
          <li>Ouvrez le bot <strong>@${botUsername}</strong></li>
          <li>Appuyez sur <strong>"Jouer"</strong> ou <strong>"Start"</strong></li>
        </ol>
      </div>
    `
        : ""
    }
    <div class="footer">
      Memory Match Game
    </div>
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
  const appName = c.env.TELEGRAM_APP_NAME || null;

  if (!token) {
    return c.html(
      htmlPage("Lien invalide", "Ce lien n'est pas valide.", null),
      400
    );
  }

  const task = await c.env.DB.prepare("SELECT * FROM link_tasks WHERE id = ?")
    .bind(token)
    .first<LinkTaskRow>();

  if (!task || task.status !== "pending") {
    return c.html(
      htmlPage(
        "Déjà utilisé",
        "Ce lien a déjà été validé ou n'existe plus. Retourne dans l'app pour en générer un nouveau.",
        botUsername,
        appName
      ),
      200
    );
  }

  const now = Date.now();
  const elapsedSeconds = (now - task.created_at) / 1000;

  if (elapsedSeconds > TOKEN_TTL_MS / 1000) {
    await c.env.DB.prepare("UPDATE link_tasks SET status = 'expired' WHERE id = ?")
      .bind(token)
      .run();
    return c.html(
      htmlPage(
        "Lien expiré",
        "Ce lien a expiré. Retourne dans l'app pour en générer un nouveau.",
        botUsername,
        appName
      ),
      200
    );
  }

  if (elapsedSeconds < MIN_PLAUSIBLE_SECONDS) {
    // Pas assez de temps écoulé pour avoir réellement traversé le parcours
    // exe.io — probable contournement direct du lien de destination.
    console.error("link-task: vérification trop rapide, probable bypass", {
      token,
      elapsedSeconds,
    });
    await logAudit(
      c.env.DB,
      String(task.user_id),
      "link_task_rejected_too_fast",
      token,
      { elapsedSeconds }
    );
    return c.html(
      htmlPage(
        "Pas si vite",
        "La validation est arrivée trop rapidement pour être honnête. Réessaie en suivant bien toutes les étapes.",
        botUsername,
        appName
      ),
      200
    );
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE link_tasks SET status = 'verified', verified_at = ? WHERE id = ?"
    ).bind(now, token),
    c.env.DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").bind(
      REWARD_COINS,
      task.user_id
    ),
    c.env.DB.prepare(
      "INSERT INTO transactions (user_id, type, amount, meta, created_at) VALUES (?, 'ad_reward', ?, ?, ?)"
    ).bind(
      task.user_id,
      REWARD_COINS,
      JSON.stringify({ placement: "link_task" }),
      now
    ),
  ]);

  return c.html(
    htmlPage(
      "Récompense reçue ! 🎉",
      `+${REWARD_COINS} coins ont été ajoutés à ton compte.`,
      botUsername,
      appName
    ),
    200
  );
});

export default linkTask;

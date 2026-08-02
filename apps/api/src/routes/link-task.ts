import { Hono } from "hono";
import { telegramAuth, type AuthEnv } from "../middleware/auth";
import { createExeioShortLink } from "../lib/exeio";
import { checkRateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const linkTask = new Hono<AuthEnv>();

const REWARD_COINS = 60;
const COOLDOWN_SECONDS = 45 * 60;
const MIN_PLAUSIBLE_SECONDS = 20;
const TOKEN_TTL_MS = 30 * 60 * 1000;

interface LinkTaskRow {
  id: string;
  user_id: number;
  status: string;
  created_at: number;
}

// ============ FONCTIONS DE HASH ============

/**
 * Mamadika ArrayBuffer ho string hex
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Miteraka token roa :
 * - publicToken : alefa amin'ny URL (azo jerena)
 * - hashedToken : voatahiry ao amin'ny base de données (tsy azo ampiasaina raha tsy manana ny original)
 */
async function generateTokenPair(): Promise<{ publicToken: string; hashedToken: string }> {
  const publicToken = crypto.randomUUID();
  
  // Hash SHA-256 ny token
  const encoder = new TextEncoder();
  const data = encoder.encode(publicToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashedToken = bufferToHex(hashBuffer);
  
  return { publicToken, hashedToken };
}

/**
 * Manamarina raha mifanaraka amin'ny hash voatahiry ny token
 */
async function verifyToken(publicToken: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(publicToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const computedHash = bufferToHex(hashBuffer);
  
  return computedHash === storedHash;
}

// ============ HTML PAGE ============

function htmlPage(
  title: string,
  message: string,
  botUsername: string | null,
  appName?: string
): string {
  let returnLink = "";
  if (botUsername && appName) {
    returnLink = `https://t.me/${botUsername}/${appName}`;
  } else if (botUsername) {
    returnLink = `https://t.me/${botUsername}?start=return`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
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
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
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
  let secondsLeft = 3;
  function updateCountdown() {
    var el = document.getElementById('countdown');
    if (el) el.textContent = secondsLeft;
    if (secondsLeft <= 0) {
      window.location.href = "${returnLink}";
    } else {
      secondsLeft--;
      setTimeout(updateCountdown, 1000);
    }
  }
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

// ============ ROUTES ============

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

  // 🔐 Miteraka token + hash
  const { publicToken, hashedToken } = await generateTokenPair();
  const now = Date.now();

  // ⚠️ ZAVA-DEHIBE : Ny HASH no voatahiry, fa TSY ny token mihitsy
  // Raha misy maka ny base de données, tsy afaka mampiasa ny hash
  // satria mila ny token original (publicToken) amin'ny URL
  await c.env.DB.prepare(
    "INSERT INTO link_tasks (id, user_id, status, created_at) VALUES (?, ?, 'pending', ?)"
  )
    .bind(hashedToken, user.id, now)  // 👈 HASH no atao "id"
    .run();

  // Alefa amina URL ny token public (azo jerena)
  const destinationUrl = `${c.env.PUBLIC_API_URL}/api/link-task/verify?token=${publicToken}`;
  const result = await createExeioShortLink(c.env.EXEIO_API_TOKEN, destinationUrl);

  if (!result.ok) {
    console.error("exe.io shorten failed", result.errorMessage);
    return c.json({ error: "exeio_unavailable" }, 502);
  }

  return c.json({ shortUrl: result.shortUrl, rewardCoins: REWARD_COINS });
});

/**
 * GET /api/link-task/verify — page publique
 * 
 * 🔐 SECURITY : Ny token alefa amin'ny URL dia publicToken.
 * Mila manao hash azy isika vao afaka mitady azy ao amin'ny base de données
 * satria ny hash no voatahiry.
 */
linkTask.get("/verify", async (c) => {
  const publicToken = c.req.query("token");  // Token avy amin'ny URL
  const botUsername = c.env.TELEGRAM_BOT_USERNAME || null;
  const appName = c.env.TELEGRAM_APP_NAME || null;

  if (!publicToken) {
    return c.html(
      htmlPage("Lien invalide", "Ce lien n'est pas valide.", null),
      400
    );
  }

  // 🔐 Hash ny token aloha vao mitady azy ao amin'ny DB
  const encoder = new TextEncoder();
  const data = encoder.encode(publicToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashedToken = bufferToHex(hashBuffer);

  // Mitady amin'ny alalan'ny HASH (fa tsy token mivantana)
  const task = await c.env.DB.prepare("SELECT * FROM link_tasks WHERE id = ?")
    .bind(hashedToken)
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
      .bind(hashedToken)
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
    console.error("link-task: vérification trop rapide, probable bypass", {
      elapsedSeconds,
    });
    await logAudit(
      c.env.DB,
      String(task.user_id),
      "link_task_rejected_too_fast",
      publicToken,
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
    ).bind(now, hashedToken),
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

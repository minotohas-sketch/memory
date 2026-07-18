import type { MiddlewareHandler } from "hono";
import { timingSafeEqual } from "../lib/security";
import { checkRateLimit } from "../lib/rate-limit";

const MAX_ATTEMPTS_PER_WINDOW = 5;
const WINDOW_SECONDS = 60;

// Auth volontairement séparée du flux Telegram : le panel admin est destiné
// à être consulté depuis un navigateur classique, pas depuis le Mini App.
// Comparaison à temps constant sur la clé + rate-limit sur les tentatives.
export const adminAuth: MiddlewareHandler<{ Bindings: CloudflareBindings }> = async (c, next) => {
  // Rate-limit par IP plutôt que par clé (une clé invalide ne doit pas
  // pouvoir être essayée en boucle) — CF-Connecting-IP est fourni par Cloudflare.
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { allowed } = await checkRateLimit(c.env.GAME_KV, `admin-auth:${ip}`, MAX_ATTEMPTS_PER_WINDOW, WINDOW_SECONDS);
  if (!allowed) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const provided = c.req.header("X-Admin-Key") ?? "";
  if (!c.env.ADMIN_API_KEY || !timingSafeEqual(provided, c.env.ADMIN_API_KEY)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};

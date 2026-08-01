import type { MiddlewareHandler } from "hono";
import { timingSafeEqual } from "../lib/security";
import { checkRateLimit } from "../lib/rate-limit";

const MAX_ATTEMPTS_PER_WINDOW = 5;
const WINDOW_SECONDS = 60;

// Auth séparée du flux Telegram.
// Le panel admin utilise une clé dédiée envoyée via X-Admin-Key.
// Comparaison à temps constant + rate limit anti brute-force.
export const adminAuth: MiddlewareHandler<{ Bindings: CloudflareBindings }> = async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";

  const { allowed } = await checkRateLimit(
    c.env.GAME_KV,
    `admin-auth:${ip}`,
    MAX_ATTEMPTS_PER_WINDOW,
    WINDOW_SECONDS
  );

  if (!allowed) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const provided = c.req.header("X-Admin-Key") ?? "";
  const expected = c.env.ADMIN_API_KEY ?? "";

  // Debug temporaire : ne montre jamais les clés
  console.log({
    hasProvided: Boolean(provided),
    providedLength: provided.length,
    hasEnvKey: Boolean(expected),
    envLength: expected.length,
    equal: timingSafeEqual(provided, expected),
  });

  if (!expected || !timingSafeEqual(provided, expected)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
};

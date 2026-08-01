import type { MiddlewareHandler } from "hono";
import { timingSafeEqual } from "../lib/security";
import { checkRateLimit } from "../lib/rate-limit";

const MAX_ATTEMPTS_PER_WINDOW = 5;
const WINDOW_SECONDS = 60;

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

  console.log({
    envExists: !!c.env.ADMIN_API_KEY,
    envLength: c.env.ADMIN_API_KEY?.length ?? 0,
    providedLength: provided.length,
    equal: timingSafeEqual(provided, c.env.ADMIN_API_KEY ?? "")
  });

  if (!c.env.ADMIN_API_KEY || !timingSafeEqual(provided, c.env.ADMIN_API_KEY)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
};

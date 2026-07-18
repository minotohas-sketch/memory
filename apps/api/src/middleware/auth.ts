import type { MiddlewareHandler } from "hono";
import { validateTelegramInitData, type TelegramUser } from "../lib/telegram-auth";

export type AuthEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    telegramUser: TelegramUser;
    startParam?: string;
  };
};

// Le client doit envoyer window.Telegram.WebApp.initData dans le header
// Authorization, avec le schéma "tma" — convention standard de l'écosystème
// Telegram Mini Apps (docs.telegram-mini-apps.com/platform/init-data).
// Pas de session côté serveur pour l'instant : chaque appel revalide l'HMAC.
export const telegramAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const initData = authHeader?.startsWith("tma ") ? authHeader.slice(4) : undefined;

  if (!initData) {
    return c.json({ error: "missing_init_data" }, 401);
  }

  try {
    const maxAge = c.env.INIT_DATA_MAX_AGE_SECONDS
      ? Number(c.env.INIT_DATA_MAX_AGE_SECONDS)
      : undefined;
    const { user, start_param } = await validateTelegramInitData(
      initData,
      c.env.TELEGRAM_BOT_TOKEN,
      maxAge
    );
    c.set("telegramUser", user);
    c.set("startParam", start_param);
  } catch {
    return c.json({ error: "invalid_init_data" }, 401);
  }

  await next();
};

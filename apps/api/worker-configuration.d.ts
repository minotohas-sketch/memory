// Généré normalement par `pnpm run types` (wrangler types --env-interface CloudflareBindings)
// une fois que D1 / KV / Queue existent réellement sur ton compte Cloudflare.
// Placeholder à main pour que le projet type-check dès maintenant — à régénérer à l'étape 9 du README.
interface CloudflareBindings {
  DB: D1Database;
  GAME_KV: KVNamespace;
  WITHDRAWAL_QUEUE: Queue;
  TELEGRAM_BOT_TOKEN: string;
  ADSGRAM_POSTBACK_SECRET: string;
  FAUCETPAY_API_KEY: string;
  ADMIN_API_KEY: string;
  INIT_DATA_MAX_AGE_SECONDS?: string;
}

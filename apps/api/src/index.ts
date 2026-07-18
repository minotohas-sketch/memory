import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import gameRoutes from "./routes/game";
import leaderboardRoutes from "./routes/leaderboard";
import adsRoutes from "./routes/ads";
import withdrawRoutes from "./routes/withdraw";
import adminRoutes from "./routes/admin";
import { sendFaucetPayPayment } from "./lib/faucetpay";
import { queuePendingWithdrawals } from "./lib/withdrawals";
import { logAudit } from "./lib/audit";
import { apiSecurityHeaders, adminPageSecurityHeaders } from "./lib/security";
import { ADMIN_PAGE_HTML } from "./admin-page";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", logger());
app.use("/api/*", cors());
app.use("/api/*", apiSecurityHeaders);

app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/game", gameRoutes);
app.route("/api/leaderboard", leaderboardRoutes);
app.route("/api/ads", adsRoutes);
app.route("/api/withdraw", withdrawRoutes);
app.route("/api/admin", adminRoutes);

// Panel admin auto-contenu (voir admin-page.ts) — la page est publique, les
// données qu'elle affiche viennent de /api/admin/* protégées par ADMIN_API_KEY.
// En-têtes distincts de l'API JSON : frame-ancestors 'none' est correct ici
// (dashboard qui ne doit jamais être encadrable) — voir lib/security.ts.
app.get("/admin", adminPageSecurityHeaders, (c) => c.html(ADMIN_PAGE_HTML));

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

interface WithdrawalRow {
  id: number;
  user_id: number;
  coins_amount: number;
  usdt_amount: number;
  address: string;
  status: string;
}

interface QueueMessage {
  withdrawalId: number;
  batchId: string;
}

const FAUCETPAY_INSUFFICIENT_FUNDS_CODE = 402;

async function processWithdrawal(withdrawalId: number, env: CloudflareBindings): Promise<void> {
  const withdrawal = await env.DB.prepare("SELECT * FROM withdrawals WHERE id = ?")
    .bind(withdrawalId)
    .first<WithdrawalRow>();

  if (!withdrawal || withdrawal.status !== "queued") {
    return; // déjà traité — idempotent en cas de retry de message
  }

  await env.DB.prepare("UPDATE withdrawals SET status = 'processing' WHERE id = ?").bind(withdrawalId).run();

  let result: Awaited<ReturnType<typeof sendFaucetPayPayment>>;
  try {
    result = await sendFaucetPayPayment(env.FAUCETPAY_API_KEY, withdrawal.address, withdrawal.usdt_amount);
  } catch (err) {
    // Erreur réseau/transitoire : on repasse en "queued" et on laisse
    // Cloudflare Queues retenter le message (max_retries dans wrangler.jsonc).
    await env.DB.prepare("UPDATE withdrawals SET status = 'queued' WHERE id = ?").bind(withdrawalId).run();
    throw err;
  }

  if (result.ok) {
    await env.DB.prepare(
      "UPDATE withdrawals SET status = 'paid', paid_at = ?, faucetpay_payout_id = ? WHERE id = ?"
    )
      .bind(Date.now(), result.payoutId ?? null, withdrawalId)
      .run();
    return;
  }

  if (result.errorCode === FAUCETPAY_INSUFFICIENT_FUNDS_CODE) {
    // Solde FaucetPay insuffisant — c'est un problème de TON côté, pas celui
    // du joueur. On remet en "pending" (pas de remboursement) : ça repartira
    // tout seul au prochain cron une fois rechargé, ou via le bouton admin
    // "traiter maintenant" — voir /admin.
    await env.DB.prepare("UPDATE withdrawals SET status = 'pending', error = ? WHERE id = ?")
      .bind(`${result.errorCode}: solde FaucetPay insuffisant, recharge ton compte`, withdrawalId)
      .run();
    return;
  }

  // Autres échecs définitifs (adresse invalide entre-temps, etc.) : pas la
  // peine de retenter la même requête, on rembourse et on log pour le panel admin.
  await env.DB.batch([
    env.DB.prepare("UPDATE withdrawals SET status = 'failed', error = ? WHERE id = ?").bind(
      `${result.errorCode}: ${result.errorMessage ?? "unknown"}`,
      withdrawalId
    ),
    env.DB.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").bind(
      withdrawal.coins_amount,
      withdrawal.user_id
    ),
  ]);
}

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<QueueMessage>, env: CloudflareBindings) {
    for (const message of batch.messages) {
      try {
        await processWithdrawal(message.body.withdrawalId, env);
        message.ack();
      } catch (err) {
        console.error("Erreur traitement retrait", message.body.withdrawalId, err);
        message.retry();
      }
    }
  },

  // Cron "0 0 * * 1" (lundi 00:00 UTC).
  async scheduled(event: ScheduledEvent, env: CloudflareBindings, _ctx: ExecutionContext) {
    const result = await queuePendingWithdrawals(env);
    await logAudit(env.DB, "system", "withdrawals_weekly_batch", result.batchId, {
      ...result,
      cron: event.cron,
    });
    console.log(
      `Batch paiement ${result.batchId} (cron ${event.cron}) : ${result.queuedCount} mis en queue, ${result.failedCount} échec(s) d'envoi (resteront pending)`
    );
  },
};

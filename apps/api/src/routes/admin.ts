import { Hono } from "hono";
import { adminAuth } from "../middleware/admin-auth";
import { getFaucetPayBalance } from "../lib/faucetpay";
import { queuePendingWithdrawals } from "../lib/withdrawals";
import { logAudit } from "../lib/audit";

const admin = new Hono<{ Bindings: CloudflareBindings }>();

admin.use("*", adminAuth);

interface WithdrawalStatusRow {
  status: string;
  count: number;
  total_usdt: number;
}

admin.get("/overview", async (c) => {
  const [userCount, coinsInCirculation, withdrawalStats, faucetPayBalance] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(coins), 0) as total FROM users").first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(usdt_amount), 0) as total_usdt
       FROM withdrawals GROUP BY status`
    ).all<WithdrawalStatusRow>(),
    getFaucetPayBalance(c.env.FAUCETPAY_API_KEY),
  ]);

  return c.json({
    userCount: userCount?.count ?? 0,
    coinsInCirculation: coinsInCirculation?.total ?? 0,
    withdrawalsByStatus: withdrawalStats.results,
    faucetPayBalance,
  });
});

admin.get("/withdrawals", async (c) => {
  const status = c.req.query("status");

  const query = status
    ? c.env.DB.prepare(
        `SELECT w.id, w.usdt_amount, w.address, w.status, w.error, w.requested_at, w.paid_at,
                u.telegram_id, u.username
         FROM withdrawals w JOIN users u ON u.id = w.user_id
         WHERE w.status = ? ORDER BY w.requested_at DESC LIMIT 100`
      ).bind(status)
    : c.env.DB.prepare(
        `SELECT w.id, w.usdt_amount, w.address, w.status, w.error, w.requested_at, w.paid_at,
                u.telegram_id, u.username
         FROM withdrawals w JOIN users u ON u.id = w.user_id
         ORDER BY w.requested_at DESC LIMIT 100`
      );

  const { results } = await query.all();
  return c.json({ withdrawals: results });
});

// Rejoue la même logique que le cron du lundi, sans attendre — utile après
// avoir résolu un souci de solde FaucetPay pour ne pas faire attendre les
// joueurs jusqu'au lundi suivant.
admin.post("/withdrawals/process-now", async (c) => {
  const result = await queuePendingWithdrawals(c.env);
  await logAudit(c.env.DB, "admin", "withdrawals_process_now", result.batchId, result);
  return c.json(result);
});

export default admin;

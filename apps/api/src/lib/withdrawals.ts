/**
 * Bascule les retraits "pending" vers la Queue. Appelé par le cron du lundi
 * (index.ts scheduled()) ET par l'action admin "traiter maintenant"
 * (routes/admin.ts) — même logique, deux déclencheurs.
 *
 * Ordre important : on ne marque un retrait "queued" en base QU'APRÈS que
 * l'envoi à la Queue ait réellement réussi (pas avant). Avant cette version,
 * le statut passait à "queued" pour TOUT le batch avant même de tenter les
 * envois — si Queue.send() échouait au milieu du batch, les retraits
 * restants se retrouvaient marqués "queued" sans jamais avoir été
 * réellement mis en queue (bloqués indéfiniment). Ici, chaque retrait est
 * traité individuellement : succès d'envoi → passe à "queued" ; échec →
 * reste "pending", sera retenté au prochain cycle (cron suivant ou action
 * admin manuelle) sans intervention.
 */
export async function queuePendingWithdrawals(
  env: CloudflareBindings
): Promise<{ batchId: string; queuedCount: number; failedCount: number }> {
  const batchId = crypto.randomUUID();

  const { results } = await env.DB.prepare("SELECT id FROM withdrawals WHERE status = 'pending'").all<{
    id: number;
  }>();

  let queuedCount = 0;
  let failedCount = 0;

  for (const w of results) {
    try {
      await env.WITHDRAWAL_QUEUE.send({ withdrawalId: w.id, batchId });
      await env.DB.prepare("UPDATE withdrawals SET status = 'queued', batch_id = ? WHERE id = ? AND status = 'pending'")
        .bind(batchId, w.id)
        .run();
      queuedCount++;
    } catch (err) {
      console.error("Échec de mise en queue du retrait", w.id, err);
      failedCount++;
      // Reste "pending" — retenté automatiquement au prochain cycle.
    }
  }

  return { batchId, queuedCount, failedCount };
}

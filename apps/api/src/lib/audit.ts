/**
 * Audit log volontairement léger : qui a fait quoi, quand — pas de
 * géolocalisation/IP/user-agent (ajouterait de la donnée personnelle à
 * gérer pour un bénéfice limité à cette échelle). Couvre les actions admin
 * et les retraits, pas chaque appel API.
 */
export async function logAudit(
  db: D1Database,
  actor: string,
  action: string,
  target: string | null,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db
      .prepare(`INSERT INTO audit_log (actor, action, target, meta, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(actor, action, target, JSON.stringify(meta), Date.now())
      .run();
  } catch (err) {
    // Un échec de log ne doit jamais faire échouer l'action elle-même.
    console.error("audit log failed", action, err);
  }
}

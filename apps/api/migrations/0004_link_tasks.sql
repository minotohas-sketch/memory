-- 0004_link_tasks.sql
-- exe.io ne fournit aucune vérification serveur-à-serveur (juste une API de
-- raccourcissement) — le token ci-dessous + le délai minimum plausible
-- vérifié dans routes/link-task.ts sont notre seule ligne de défense.

CREATE TABLE link_tasks (
  id TEXT PRIMARY KEY, -- token opaque, généré côté serveur
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | expired
  created_at INTEGER NOT NULL,
  verified_at INTEGER
);

CREATE INDEX idx_link_tasks_user ON link_tasks(user_id, created_at);

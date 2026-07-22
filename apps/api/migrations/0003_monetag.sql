-- 0003_monetag.sql
-- Monetag ne fournit pas de mécanisme de signature pour ses postbacks TMA
-- (leur doc dit explicitement que l'endpoint doit être accessible sans authentification
-- de leur côté) — la dédup et le cooldown ci-dessous sont notre seule ligne de
-- défense en plus du secret qu'on ajoute nous-mêmes dans l'URL configurée sur
-- leur dashboard (voir apps/api/src/routes/monetag.ts).

CREATE TABLE ad_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  event_id TEXT NOT NULL UNIQUE, -- "ymid" Monetag : dédoublonnage si un postback est renvoyé 2 fois
  placement TEXT NOT NULL,
  reward INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_ad_rewards_user_placement ON ad_rewards(user_id, placement, created_at);

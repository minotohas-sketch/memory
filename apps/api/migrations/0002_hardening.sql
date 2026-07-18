-- 0002_hardening.sql
-- SQLite ne permet pas d'ajouter une contrainte CHECK via ALTER TABLE : on
-- reconstruit la table users (pattern standard SQLite), les autres tables
-- gardent leurs FK vers "users" sans modification puisque le nom de table
-- final est identique.

PRAGMA foreign_keys=OFF;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  account_level INTEGER NOT NULL DEFAULT 1,
  energy INTEGER NOT NULL DEFAULT 5 CHECK (energy >= 0),
  energy_updated_at INTEGER NOT NULL,
  streak_count INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by INTEGER REFERENCES users_new(id),
  faucetpay_address TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO users_new SELECT * FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX idx_users_referral_code ON users(referral_code);

PRAGMA foreign_keys=ON;

-- Audit log volontairement simple : qui, quoi, quand — pas de géoloc/IP/UA.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL, -- "admin" | "system" | telegram_id du joueur
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

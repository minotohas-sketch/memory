-- 0001_init.sql
-- Schéma initial : users, sessions de jeu, transactions, retraits, parrainage, tâches.
-- Voir memory-match-spec.md §8 pour le contexte complet.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  account_level INTEGER NOT NULL DEFAULT 1,
  energy INTEGER NOT NULL DEFAULT 5,
  energy_updated_at INTEGER NOT NULL,
  streak_count INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by INTEGER REFERENCES users(id),
  faucetpay_address TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_users_referral_code ON users(referral_code);

CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  level INTEGER NOT NULL,
  seed TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  time_taken_ms INTEGER,
  moves INTEGER,
  status TEXT NOT NULL DEFAULT 'active', -- active | won | lost | expired
  coins_earned INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0
);

CREATE INDEX idx_game_sessions_user ON game_sessions(user_id);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- game_reward | ad_reward | task_reward | referral_bonus | streak_bonus | withdrawal
  amount INTEGER NOT NULL, -- négatif pour les withdrawals
  meta TEXT, -- JSON
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_transactions_user ON transactions(user_id);

CREATE TABLE withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  coins_amount INTEGER NOT NULL,
  usdt_amount REAL NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | queued | processing | paid | failed
  batch_id TEXT,
  faucetpay_payout_id TEXT,
  error TEXT,
  requested_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE INDEX idx_withdrawals_status ON withdrawals(status);

CREATE TABLE referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES users(id),
  referred_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  bonus_paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- adsgram_task | social | custom
  adsgram_block_id TEXT,
  reward_coins INTEGER NOT NULL,
  repeatable INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE task_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  completed_at INTEGER NOT NULL,
  UNIQUE(user_id, task_id)
);

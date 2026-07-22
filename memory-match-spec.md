# Memory Match — Telegram Mini App
### Spec technique v1 — 15 juillet 2026

## 1. Vue d'ensemble

Mini App Telegram "play & earn" : jeu de memory à 4 niveaux chronométrés, avec coins / XP / énergie, streak quotidien, système de parrainage, monétisation via Adsgram, et retraits hebdomadaires en USDT (TRC-20) via FaucetPay.

## 2. Architecture

```
Telegram Client (WebApp SDK)
        │
        ▼
Cloudflare Pages ── Frontend (React + Vite + TS)
        │  fetch API, Bearer = initData Telegram
        ▼
Cloudflare Workers ── API (Hono + TS)
   ├── D1     → users, game_sessions, transactions, withdrawals, referrals, tasks
   ├── KV     → seeds anti-triche, rate-limit, cache leaderboard
   ├── Queue  → "withdrawal-queue" (consumer → API FaucetPay)
   └── Cron   → "0 0 * * 1" (lundi 00:00 UTC) → déclenche le batch de paiement
```

**Stack conseillée** : React + Vite + TS + Tailwind (front), Hono + TS (Worker), Drizzle ORM pour D1, Zod pour la validation. Monorepo pnpm : `apps/web`, `apps/api`, `packages/shared`.

## 3. Le jeu — 4 niveaux chronométrés

| Niveau | Grille | Paires | Temps limite | Récompense base |
|---|---|---|---|---|
| 1 · Facile | 4×4 | 8 | 60 s | 50 coins |
| 2 · Moyen | 4×5 | 10 | 75 s | 90 coins |
| 3 · Difficile | 4×6 | 12 | 90 s | 150 coins |
| 4 · Expert | 6×6 | 18 | 120 s | 250 coins |

+ bonus vitesse (proportionnel au temps restant) + multiplicateur de streak. *Chiffres de départ à ajuster — voir §9.*

**Anti-triche** : le serveur génère la disposition des cartes (seed aléatoire) au lancement de la partie, la stocke en KV (`session:{id}`, TTL = temps du niveau + marge) et n'envoie au client que ce qu'il doit voir. À la fin, le client renvoie ses coups + le temps écoulé ; le serveur revalide tout avant de créditer coins/XP. Sans ça, un client modifié peut se créditer ce qu'il veut.

## 4. Progression

- **Énergie** : max 5, régénère +1 toutes les 30 min (calculée à la volée depuis `energy_updated_at`, pas besoin de cron), −1 par partie lancée.
- **Coins** : barème §3 + bonus vitesse + bonus streak.
- **XP** : 10 × niveau par partie réussie. Niveau de compte suivant = `100 × niveau^1.5` XP.
- **Streak** : +1 à la 1ère partie du jour, reset si un jour est sauté. Paliers bonus (exemple : jour 3 → +50 coins, jour 7 → +150, jour 30 → +750).
- **Parrainage** : lien `https://t.me/<bot>/<app>?startapp=ref_<code>`. ⚠️ Pour les Mini Apps le paramètre est `startapp` (pas `start`) — il arrive côté client dans `initDataUnsafe.start_param`. Filleul : bonus à l'inscription. Parrain : bonus quand le filleul termine sa **1ère partie**, pas juste à l'ouverture de l'app (sinon farm de faux comptes).

## 5. Monétisation — Adsgram

Vérifié sur leur doc officielle (docs.adsgram.ai) :

- SDK : `<script src="https://sad.adsgram.ai/js/sad.min.js">` dans le `<head>`, puis `window.Adsgram.init({ blockId })` → retourne un `AdController`. `AdController.show()` renvoie une Promise qui **resolve** si la pub est vue jusqu'au bout (ou fermée en interstitiel), et **reject** en cas d'erreur/skip. Package React officiel : `@adsgram/react` (hook `useAdsgram`, composant `<AdsgramTask>`).
- 3 types de blocs à créer sur `partner.adsgram.ai`, **chacun avec un format de Block ID différent** (confirmé via leur doc "for LLMs" — à surveiller, j'avais simplifié à tort dans ma 1ère version) :

  | Type | Format du Block ID | Exemple |
  |---|---|---|
  | Reward (RewardedVideo) | numérique brut | `"123"` |
  | Interstitial (FullscreenMedia) | `int-xxx` | `"int-456"` |
  | Task | `task-xxx` | `"task-789"` |

  Reward/Interstitial s'initialisent via `window.Adsgram.init({ blockId })`. Task = composant web `<adsgram-task>`, pas d'init nécessaire, un seul bloc Task autorisé par compte.
- Ton app doit passer une **modération Adsgram** (contact support avec lien du bot + captures BotFather) avant les vraies impressions.

### Reward URL (S2S) — confirmé sur ton dashboard + docs.adsgram.ai

Correction par rapport à ma 1ère version : chaque bloc **Reward** *et* **Task** a un champ *Reward URL* (tu l'as maintenant vu sur les deux). Même mécanisme des deux côtés — en plus du callback client, les serveurs Adsgram font un **GET direct vers cette URL** quand l'événement REWARD est validé de leur côté :

- Requête HTTPS (port 443), GET, envoyée par leurs serveurs — pas par le navigateur du user
- Le placeholder `[userId]` est remplacé par le Telegram ID : ex. `https://tonapi.workers.dev/api/ads/postback?userid=[userId]`
- **Pas envoyée en mode debug** (les vues de test ne comptent pas)

C'est un vrai signal serveur-à-serveur : c'est **lui qui doit créditer les coins**, pas le callback client. Le callback client (`onReward`) sert seulement à l'UX (ex : "récompense en cours de validation…").

⚠️ Point d'attention : le format documenté n'a que `[userId]`, pas de signature. Comme c'est toi qui écris la chaîne de l'URL dans le dashboard Adsgram, ajoute-lui un secret statique en query param (`...&secret=TON_SECRET`) que tu vérifies côté serveur — pratique standard vu qu'Adsgram ne signe pas la requête nativement. Ajoute aussi une déduplication (ex : corrélation avec une entrée "pending" créée juste avant `show()`, consommée une seule fois) pour éviter qu'un appel rejoué crédite deux fois.

### Intégration SDK — détails confirmés via leur doc "for LLMs"

- **Reward/Interstitial** : events via `AdController.addEventListener(...)` → `onStart`, `onSkip`, `onReward` (Reward vu jusqu'au bout), `onComplete` (Interstitial vu/fermé — **pas de `onReward` pour ce format**, écoute `onComplete`), `onError`, `onBannerNotFound`, `onNonStopShow`, `onTooLongSession`. Nettoyage : `AdController.destroy()` — à appeler dans le cleanup du `useEffect` côté React.
- **Task** : events directement sur l'élément `<adsgram-task>` → `reward`, `onBannerNotFound`, `onError`, `onTooLongSession`. Personnalisable via slots (`reward`, `button`, `claim`, `done`) et variables CSS (`--adsgram-task-font-size`, `--adsgram-task-icon-size`, `--adsgram-task-button-width`, etc.).
- ⚠️ **Incohérence relevée entre leurs 2 pages de doc** (datées de la même mise à jour) : la page "Task Integration" écrit `data-block-id` / `data-debug` sur `<adsgram-task>`, alors que leur doc "for LLMs" écrit `block-id` / `debug` (sans préfixe `data-`) partout, y compris dans les exemples React fonctionnels. **Mise à jour** : le code (`apps/web/src/components/TasksScreen.tsx`) pose maintenant les 4 variantes (`block-id`, `data-block-id`, `debug`, `data-debug`) plutôt que de parier sur une seule — la 1ère version ne le faisait que pour `block-id`/`data-block-id`, pas pour `debug`/`data-debug`, malgré cette note. Si l'un des deux docs a une coquille, l'autre attribut prend le relais.
- Astuce debug : `debugBannerType: "FullscreenMedia" | "RewardedVideo"` dans `init()` force le type de pub simulée — utile pour tester Interstitial sans attendre la modération.

## 6. Payout — FaucetPay USDT TRC-20

Vérifié sur faucetpay.io/page/api-documentation :

- Tu t'inscris comme **Faucet Owner** (faucetpay.io/page/faucet-admin) pour obtenir une clé API.
- Endpoint : `POST https://faucetpay.io/api/v1/pay`, corps en `multipart/form-data` — paramètres : `api_key`, `to` (adresse liée au compte destinataire), `amount`, `currency`, `referral` (laisse `false` — c'est le programme de parrainage FaucetPay, pas le tien), `ip_address` (optionnel, anti-fraude).
- **Le destinataire doit avoir un compte FaucetPay avec son adresse USDT-TRC20 "liée"** dans son dashboard (menu *Linked Addresses*) — sinon l'appel échoue avec l'erreur `456` (adresse n'appartenant à aucun utilisateur). FaucetPay supporte USDT sur TRC20, Polygon, ERC20 et BSC — bien préciser TRC20.
- → Dans ton flux de retrait, valide l'adresse avec leur méthode `checkAddress` **au moment où l'utilisateur la soumet**, pas seulement le jour du batch. Ça évite de découvrir le problème le lundi et de devoir tout re-traiter.
- Vérifie le code exact de la devise via `listCurrencies` (probablement `"USDT"`, le réseau TRC20 étant déterminé par l'adresse liée côté FaucetPay).
- Ton solde FaucetPay doit être préchargé en USDT-TRC20 avant chaque batch (sinon erreur `402`, fonds insuffisants). La réponse d'un paiement réussi inclut un `payout_id` à stocker pour réconciliation.

## 7. Flux du paiement hebdomadaire

1. Cron Worker `0 0 * * 1` (lundi 00:00 **UTC** — à confirmer si c'est bien le fuseau voulu, sinon ajuster l'expression cron).
2. Requête D1 : tous les `withdrawals` en statut `pending` et ≥ montant minimum → regroupés sous un `batch_id`.
3. Chaque retrait est poussé comme message dans la Queue `withdrawal-queue`.
4. Le **consumer** de la queue traite les messages un par un, appelle l'API FaucetPay, gère les retries/erreurs, met à jour le statut (`paid` / `failed`) et stocke le `payout_id`.

## 8. Modèle de données D1 (brouillon — à affiner en Phase 1)

```sql
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

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- game_reward | ad_reward | task_reward | referral_bonus | streak_bonus | withdrawal
  amount INTEGER NOT NULL, -- négatif pour les withdrawals
  meta TEXT, -- JSON
  created_at INTEGER NOT NULL
);

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
```

**KV** : `session:{id}` (seed + carte + expiry), `ratelimit:ads:{userId}:{date}`, `leaderboard:weekly` (cache).
**Queue** : `withdrawal-queue`, message = `{ withdrawalId, userId, address, usdtAmount }`.

## 9. Endpoints API (Worker)

```
POST /api/auth/telegram          validation initData (HMAC bot token), upsert user, session
GET  /api/me                     profil : coins, xp, énergie, streak, niveau
POST /api/game/start              { level } → vérifie énergie, crée la session, renvoie le plateau
POST /api/game/finish             { sessionId, moves, clientTime } → revalide, crédite coins/xp
GET  /api/ads/postback            appelé par les serveurs Adsgram : ?userid=[ID]&secret=... → crédite (source de vérité)
POST /api/ads/pending              optionnel : le client trace une tentative juste avant show(), pour l'UX en attendant le postback
GET  /api/tasks                   liste des tâches actives
POST /api/tasks/:id/complete
POST /api/referral/apply          appelé au 1er lancement avec start_param
GET  /api/leaderboard
POST /api/withdraw                { address } → checkAddress FaucetPay, crée le withdrawal (pending)
GET  /api/withdraw/history
```

## 10. Économie — chiffres à valider avec toi

- Taux de conversion coins → USDT (ex. proposé : 10 000 coins = 1 USDT)
- Retrait minimum (ex. proposé : 1 USDT)
- Barème coins/XP par niveau (proposé en §3-4)
- Paramètres énergie (max, vitesse de régénération)

Ces chiffres doivent surtout rester cohérents avec ton eCPM Adsgram réel — sinon tu payes plus en retraits que ce que la pub rapporte.

## 11. Plan de build (phases)

1. **Fondations** — monorepo, config Wrangler, schéma D1 + migrations, namespaces KV/Queue, auth Telegram (`initData`), jeu jouable en local (4 niveaux + timer, pas encore relié au serveur)
2. **Économie serveur** — energy/coins/xp persistés, anti-triche (seed en KV), leaderboard
3. **Engagement** — streak, parrainage (`startapp`)
4. **Monétisation** — Adsgram (reward/interstitial/task) + token anti-abus
5. **Payout** — FaucetPay (endpoint retrait, queue consumer, cron du lundi), réconciliation
6. **Durcissement** — rate-limiting global, mini panel admin, tests, déploiement + monitoring

## 12. Prérequis à préparer de ton côté

- [ ] Compte Cloudflare + Wrangler CLI — le plan **Free** couvre D1 + KV + Queues + Cron pour démarrer ; la première limite que tu vas probablement toucher est le KV à 1 000 écritures/jour, pas les Queues (10k opérations/jour en free)
- [ ] Bot Telegram via @BotFather (`/newbot` puis `/newapp` pour lier le Mini App)
- [ ] Compte Adsgram (partner.adsgram.ai) + modération de l'app + Block IDs (reward / interstitial / task)
- [ ] Compte FaucetPay "Faucet Owner" + clé API + solde USDT-TRC20 préchargé

## 13. Points d'attention

- Équilibre éco pub/payout (§10)
- Adsgram : la Reward URL (S2S) est la source de vérité pour créditer, pas le callback client → protège-la avec un secret (§5)
- FaucetPay : valider l'adresse du destinataire dès la demande de retrait, pas le jour du batch (§6)
- Retraits crypto → obligations KYC/AML potentielles selon ta juridiction ; à vérifier de ton côté, ce n'est pas un terrain où je peux conseiller juridiquement

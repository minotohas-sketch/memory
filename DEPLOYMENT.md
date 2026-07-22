# Guide de déploiement — Memory Match

Checklist volontairement actionnable : commandes à copier-coller, dans l'ordre. Pour le "pourquoi" de chaque choix, voir `memory-match-spec.md` et `README.md` — ce fichier ne sert qu'à déployer.

Compte environ 45-90 minutes la première fois, modération Adsgram non comprise (elle tourne en parallèle, lance-la tôt — étape 6.4).

---

## 0. Prérequis

- [ ] Compte Cloudflare (le plan Free suffit pour démarrer)
- [ ] Node.js 20+ et pnpm (`npm install -g pnpm`)
- [ ] Un compte Telegram
- [ ] `curl` disponible (pour la vérification à l'étape 5)

---

## 1. Installer le projet

```bash
cd memory-match
pnpm install
wrangler login
```

Une fenêtre de navigateur s'ouvre pour autoriser Wrangler sur ton compte Cloudflare.

---

## 2. Créer les ressources Cloudflare (backend)

```bash
cd apps/api
```

### 2.1 D1 — base de données

```bash
wrangler d1 create memory-match-db
```

Copie le `database_id` retourné dans `apps/api/wrangler.jsonc` (remplace `REPLACE_AFTER_D1_CREATE`).

### 2.2 KV — cache, sessions, rate-limit

```bash
wrangler kv namespace create memory-match-kv
```

Copie l'`id` retourné dans `wrangler.jsonc`, binding `GAME_KV` (remplace `REPLACE_AFTER_KV_CREATE`).

### 2.3 Queue — paiements hebdomadaires

```bash
wrangler queues create withdrawal-queue
wrangler queues create withdrawal-queue-dlq
```

### 2.4 Migrations

```bash
pnpm run db:migrate:local
pnpm run db:migrate:remote
```

Tu dois voir `0001_init.sql` et `0002_hardening.sql` passer à ✅ dans les deux cas.

---

## 3. Créer le bot Telegram

Dans Telegram, ouvre [@BotFather](https://t.me/BotFather) :

1. `/newbot` → suis les instructions → **note le token** (`123456789:AAxxx...`)
2. `/newapp` → choisis ton bot → nom, description, image → **note le "short name"** que tu choisis (réutilisé à l'étape 8)

---

## 4. Secrets du backend

Toujours dans `apps/api` :

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
# colle le token de l'étape 3

wrangler secret put ADSGRAM_POSTBACK_SECRET
# valeur aléatoire, ex : openssl rand -hex 32

wrangler secret put ADMIN_API_KEY
# une AUTRE valeur aléatoire, différente de la précédente

wrangler secret put FAUCETPAY_API_KEY
# voir étape 7 — tu peux revenir ici après si tu ne l'as pas encore
```

Pour le dev local uniquement : copie les mêmes valeurs dans `apps/api/.dev.vars` (créé à partir de `.dev.vars.example`). Ce fichier n'est jamais commité.

---

## 5. Déployer le backend

```bash
pnpm run types
wrangler deploy
```

Note l'URL retournée (ex. `https://memory-match-api.TON-SOUS-DOMAINE.workers.dev`) — c'est ton **URL d'API**, tu en as besoin dans presque toutes les étapes suivantes.

Vérifie que ça répond :

```bash
curl https://TON-URL-API/health
# doit renvoyer {"status":"ok","ts":...}
```

---

## 6. Configurer Adsgram

1. Crée un compte sur [partner.adsgram.ai](https://partner.adsgram.ai)
2. Crée **4 blocs** (section "Get blockId" de leur doc) :

   | Bloc | Type | Reward URL |
   |---|---|---|
   | Énergie | Reward | `https://TON-URL-API/api/ads/postback?userid=[userId]&secret=TON_ADSGRAM_POSTBACK_SECRET&placement=energy_refill` |
   | Coins bonus | Reward | `https://TON-URL-API/api/ads/postback?userid=[userId]&secret=TON_ADSGRAM_POSTBACK_SECRET&placement=bonus_coins` |
   | Interstitiel | Interstitial | *(aucune — pas de récompense pour ce format)* |
   | Tâche | Task | `https://TON-URL-API/api/ads/postback?userid=[userId]&secret=TON_ADSGRAM_POSTBACK_SECRET&placement=task` |

   Remplace `TON_ADSGRAM_POSTBACK_SECRET` par la valeur que tu as réellement posée à l'étape 4.

3. Note les 4 Block ID — **formats différents selon le type**, piège classique :
   - Reward → numérique brut (ex. `123`)
   - Interstitial → `int-xxx`
   - Task → `task-xxx`
4. **Lance la modération maintenant** (contact support Adsgram, lien du bot + captures BotFather) — ça prend du temps, autant que ça tourne pendant que tu avances sur le reste. En attendant, teste en mode `debug`.

---

## 7. Configurer FaucetPay

1. Inscris ton app comme Faucet sur [faucetpay.io/page/faucet-admin](https://faucetpay.io/page/faucet-admin)
2. Récupère la clé API → si pas encore fait, retourne à l'étape 4 : `wrangler secret put FAUCETPAY_API_KEY`
3. ⚠️ **Vérifie ces 2 valeurs avant le premier vrai paiement** (voir `apps/api/src/lib/faucetpay.ts` — commentaire détaillé en tête de fichier, et `README.md` section Phase 5) :
   - le code devise exact pour USDT-TRC20 (appelle `listCurrencies`)
   - le multiplicateur de conversion des montants (appelle `balance`, compare le champ brut à un champ lisible)
4. Précharge ton solde en USDT-TRC20 — sans ça, tous les paiements échouent (remboursés automatiquement au joueur, mais personne n'est payé)

---

## 8. Configurer et déployer le frontend

```bash
cd apps/web
cp .env.example .env.production
```

Édite `apps/web/.env.production` :

```
VITE_API_BASE_URL=https://TON-URL-API
VITE_TELEGRAM_BOT_USERNAME=ton_bot_sans_le_arobase
VITE_TELEGRAM_APP_SHORTNAME=le_short_name_de_l_etape_3
VITE_ADSGRAM_ENERGY_BLOCK_ID=...
VITE_ADSGRAM_BONUS_BLOCK_ID=...
VITE_ADSGRAM_INTERSTITIAL_BLOCK_ID=int-...
VITE_ADSGRAM_TASK_BLOCK_ID=task-...
```

### 8.1 Build

```bash
pnpm run build
```

Génère `apps/web/dist`.

### 8.2 Déployer sur Cloudflare Pages

Le plus simple et le plus fiable pour un monorepo comme celui-ci : déployer le dossier déjà buildé en CLI, plutôt que de laisser Cloudflare détecter et builder lui-même depuis Git.

```bash
npx wrangler pages deploy dist --project-name=memory-match
```

Premier déploiement : Wrangler propose de créer le projet Pages, confirme. Note l'URL retournée (ex. `https://memory-match.pages.dev`).

> Alternative : connecter le repo Git dans le dashboard Cloudflare Pages pour un déploiement automatique à chaque push. Si tu pars sur cette option, pense à régler **Root directory = `apps/web`** et **Build command = `cd ../.. && pnpm install && pnpm run build:web`** dans les réglages du projet Pages — sinon Cloudflare ne trouve pas l'app dans le monorepo (erreur classique, voir Dépannage).

---

## 9. Relier le Mini App à Telegram

Retourne dans [@BotFather](https://t.me/BotFather) :

1. `/myapps` → sélectionne ton app
2. **Edit Web App URL** → colle l'URL Cloudflare Pages de l'étape 8

---

## 10. Vérifications avant le vrai lancement

- [ ] Ouvre le bot dans Telegram : l'app se charge, ton prénom s'affiche
- [ ] Joue une partie niveau 1 jusqu'au bout : coins et XP augmentent, visible en rouvrant l'app
- [ ] `https://TON-URL-API/admin` accepte ta clé admin et affiche les stats
- [ ] Teste une pub reward en mode `debug=true` avant la fin de la modération Adsgram
- [ ] Une fois modéré, teste une vraie pub (énergie, coins bonus, tâche)
- [ ] Teste un retrait avec un **petit montant vers ton propre compte FaucetPay** avant de faire confiance au batch automatique (rappel étape 7.3)
- [ ] Vérifie que "👥 Inviter des amis" génère bien un lien `https://t.me/ton_bot/ton_short_name?startapp=ref_...`

## 11. Le premier lundi

Le cron se déclenche automatiquement à 00:00 UTC. Vérifie `/admin` le lundi matin pour confirmer que les retraits en attente sont passés à "payé". Si le solde FaucetPay était insuffisant, recharge puis clique "Traiter en attente maintenant" dans `/admin` plutôt que d'attendre le lundi suivant.

---

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `invalid_init_data` en boucle | App ouverte hors Telegram (initData absent), ou mauvais `TELEGRAM_BOT_TOKEN` |
| Erreur CORS dans la console | `VITE_API_BASE_URL` pointe vers la mauvaise URL, ou backend pas encore déployé |
| Pub Adsgram qui ne s'affiche jamais | Modération pas terminée (utilise `debug=true` en attendant), ou mauvais format de Block ID (voir étape 6.3) |
| `not_enough_energy` alors que la pub "énergie" vient d'être regardée | Le crédit vient du postback serveur d'Adsgram (asynchrone, pas du callback client) — attends quelques secondes, voir spec §5 |
| Retrait qui reste "pending" indéfiniment | Normal avant lundi 00:00 UTC — sinon vérifie le solde FaucetPay dans `/admin` |
| "Could not find a wrangler config" sur Cloudflare Pages (déploiement Git) | Root directory du projet Pages pas réglé sur `apps/web` (voir note étape 8.2) |
| Types cassés après `wrangler d1 create` / `kv namespace create` | Relance `pnpm run types` (étape 5) pour régénérer `worker-configuration.d.ts` à partir des vraies ressources |

---

## Récap à conserver

| Élément | Valeur |
|---|---|
| URL API (Worker) | |
| URL frontend (Pages) | |
| Bot Telegram | @ |
| Mini App short name | |
| Block ID Reward énergie | |
| Block ID Reward coins | |
| Block ID Interstitial | |
| Block ID Task | |

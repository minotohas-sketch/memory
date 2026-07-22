# Memory Match — Telegram Mini App

Voir `memory-match-spec.md` (partagé séparément) pour l'architecture complète et le plan de phases détaillé.

## Ce qui est fait

**Étape 1 — Fondations backend**
- Monorepo pnpm, squelette Hono sur Cloudflare Workers
- `wrangler.jsonc` avec bindings D1 / KV / Queue / Cron (IDs à remplacer après création des ressources)
- Migration D1 initiale (`apps/api/migrations/0001_init.sql`) — les 7 tables du schéma
- Validation Telegram `initData` (HMAC-SHA256), transmise via `Authorization: tma <initData>` (convention standard Telegram Mini Apps)

**Étape 2 — Le jeu**
- App React + Vite + TypeScript + Tailwind v4 dans `apps/web`
- SDK Telegram WebApp initialisé (ready/expand/couleurs/haptique), repli automatique hors Telegram pour tester dans un navigateur classique
- Les 4 niveaux du spec, timer, flip 3D, détection victoire/défaite
- Identité visuelle propre (palette encre/or/menthe, Fraunces/Manrope/JetBrains Mono) — volontairement indépendante du thème Telegram

**Phase 2 — Économie serveur, anti-triche, leaderboard**
- `packages/shared` : source unique des niveaux + formules de récompense/XP (front ET back)
- `POST /api/game/start` : ouvre une session, dépense l'énergie (régénération à la volée, progression partielle préservée)
- `POST /api/game/finish` : le serveur revalide tout (temps écoulé, coups, paires, session à usage unique) et ne fait jamais confiance au client — récompense calculée sur **son propre** chronométrage. Écritures D1 atomiques via `batch()`
- `GET /api/leaderboard` : classement hebdomadaire (coins gagnés depuis lundi 00:00 UTC), agrégé en D1, caché en KV 60s
- Frontend connecté : stats réelles affichées, écran de classement, jeu qui ouvre/valide une session à chaque partie

**Phase 3 — Streak et parrainage**
- Streak quotidien : compte à la 1ère partie *terminée* de la journée (victoire ou défaite), reset si un jour est sauté, bonus aux paliers 3/7/30 jours — calcul en `packages/shared` (idempotent, un seul crédit par jour même si plusieurs parties sont jouées)
- Parrainage complet : le filleul reçoit son bonus à l'inscription (déjà en place depuis l'étape 1, juste jamais versé) ; le parrain reçoit le sien quand le filleul valide sa **première vraie victoire** (passe l'anti-triche du §Phase 2 — pas juste un "finish"), une seule fois par parrainage (`bonus_paid`)
- Écran "Inviter des amis" : lien `https://t.me/<bot>/<app>?startapp=ref_<code>`, partage natif via `openTelegramLink`
- Tous les crédits de coins passent maintenant par des incréments SQL relatifs (`coins = coins + ?`) plutôt que des valeurs absolues recalculées en JS — plus robuste si le joueur a l'app ouverte sur 2 appareils en même temps

**Phase 4 — Monétisation Adsgram**
- `GET /api/ads/postback` : appelé par les serveurs Adsgram eux-mêmes (Reward URL S2S, voir spec §5) — **seule** source de vérité pour créditer une récompense pub, jamais le callback client. Protégé par un secret en query param + cooldown par (placement, utilisateur) en KV
- 4 blocs Adsgram distincts, chacun avec sa propre Reward URL :
  - `energy_refill` (Reward, +1 énergie), `bonus_coins` (Reward, +30 coins) : bouton dédié sur l'écran principal
  - `interstitial` (Interstitial, pas de récompense) : affiché tous les 3 retours vers la sélection de niveau
  - `task` (Task, +40 coins, un seul bloc Task autorisé côté Adsgram) : écran "Tâches" dédié
- Les tables `tasks`/`task_completions` du schéma initial ne sont **pas** utilisées pour ça : Adsgram gère son propre pool de tâches et ne renvoie aucun identifiant de tâche dans le postback, donc pas moyen de les relier proprement à une tâche précise chez nous. On retombe sur un cooldown par utilisateur, comme pour les reward ads. Ces 2 tables restent disponibles si tu veux un système de tâches perso plus tard (hors Adsgram)

### Configurer Adsgram (à faire de ton côté, sur partner.adsgram.ai)

1. Crée un secret fort pour `ADSGRAM_POSTBACK_SECRET` (ex. `openssl rand -hex 32`) et pose-le : `wrangler secret put ADSGRAM_POSTBACK_SECRET`
2. Crée 4 blocs, avec cette Reward URL à chaque fois (adapte `TON_DOMAINE` et `TON_SECRET`, change juste `placement`) :
   - Reward "énergie" : `https://TON_DOMAINE/api/ads/postback?userid=[userId]&secret=TON_SECRET&placement=energy_refill`
   - Reward "coins" : `https://TON_DOMAINE/api/ads/postback?userid=[userId]&secret=TON_SECRET&placement=bonus_coins`
   - Interstitial : pas de Reward URL nécessaire (pas de récompense pour ce format)
   - Task (un seul autorisé) : `https://TON_DOMAINE/api/ads/postback?userid=[userId]&secret=TON_SECRET&placement=task`
3. Copie les 4 Block IDs dans `.env.local` du front (`VITE_ADSGRAM_*`) — attention aux formats différents par type (§5 du spec : Reward = numérique brut, Interstitial = `int-xxx`, Task = `task-xxx`)
4. Ton app doit passer la **modération Adsgram** (contact support, lien du bot + captures BotFather) avant que les vraies pubs ne s'affichent — en attendant, les blocs restent utilisables en `debug`

**Phase 5 — Retraits USDT-TRC20 via FaucetPay**
- `POST /api/withdraw` : convertit le solde en USDT, vérifie le minimum, **valide l'adresse via l'API FaucetPay dès la demande** (pas seulement le jour du batch), déduit les coins immédiatement
- `GET /api/withdraw/history` : historique des retraits du joueur
- Cron du lundi 00:00 UTC : bascule tous les retraits `pending` en un batch, les pousse dans la Queue
- Consumer de la Queue : appelle l'API FaucetPay, marque `paid` (avec le `payout_id`) ou `failed` + **rembourse automatiquement les coins** en cas d'échec définitif (adresse invalide, solde FaucetPay insuffisant...). Les erreurs réseau/transitoires sont retentées automatiquement par Cloudflare Queues (`max_retries: 5` dans `wrangler.jsonc`) plutôt que remboursées tout de suite
- Écran "Retirer" : solde en USDT, formulaire d'adresse, historique avec statuts

### ⚠️ À vérifier absolument avant le premier vrai paiement

Leur page de doc API (`faucetpay.io/page/api-documentation`) est une SPA rendue en JS — mes outils de recherche ne peuvent pas la lire. J'ai implémenté l'intégration à partir de ce que j'ai pu confirmer par recherche (endpoint, paramètres, codes d'erreur 456/402, et le fait que leur endpoint *balance* renvoie le BTC en satoshis), mais **2 valeurs dans `apps/api/src/lib/faucetpay.ts` restent à vérifier toi-même** (2 minutes, avec ta vraie clé API) :

1. **`FAUCETPAY_CURRENCY_CODE`** (actuellement `"USDTTRC20"`) — appelle `listCurrencies` et cherche le code qui correspond à "Tether TRC20 (USDT)" dans la réponse.
2. **`FAUCETPAY_SMALLEST_UNIT_MULTIPLIER`** (actuellement `100_000_000`, soit 10^8) — appelle `balance` avec ce code, compare le champ brut à un champ lisible (comme `balance` vs `balance_bitcoin` pour BTC) pour en déduire le vrai multiplicateur.

**Teste avec un tout petit montant vers ton propre compte avant de faire confiance au batch automatique du lundi** — c'est le seul point de toute cette conversation où je n'ai pas pu atteindre une confirmation à 100 %, et ça touche directement à combien d'argent réel part à chaque paiement.

### Configurer FaucetPay (à faire de ton côté)

1. Inscris ton app comme "Faucet" sur [faucetpay.io/page/faucet-admin](https://faucetpay.io/page/faucet-admin) → récupère la clé API
2. `wrangler secret put FAUCETPAY_API_KEY`
3. Précharge ton solde FaucetPay en USDT-TRC20 — sans ça, tous les paiements échouent en 402 (remboursés automatiquement, mais aucun joueur n'est payé)
4. Vérifie les 2 valeurs ci-dessus avant le premier lundi en prod

Testé : `pnpm install`, `tsc` (front + back), `vite build` et `wrangler deploy --dry-run` passent tous sans erreur. Je n'ai en revanche pas pu tester d'appel réel à l'API FaucetPay (pas de clé, et leur domaine n'est de toute façon pas dans mon accès réseau) — d'où l'avertissement ci-dessus.

### Pas encore fait (hors scope du spec initial, mais à considérer)
- Rate-limiting global au-delà de ce qui existe déjà (énergie, cooldowns pub)
- KYC/AML : hors de mon rayon, à vérifier selon ta juridiction (voir spec §13)

**Phase 6 — Panel admin**
- `GET /admin` : page HTML/CSS/JS autonome servie directement par le Worker (pas de build séparé, pas de 2e déploiement) — vue d'ensemble (utilisateurs, coins en circulation, solde FaucetPay, retraits par statut) + tableau des retraits filtrable + bouton "traiter les retraits en attente maintenant" (rejoue la logique du cron sans attendre lundi, utile après avoir rechargé un solde FaucetPay insuffisant)
- Auth séparée de Telegram : une simple clé (`X-Admin-Key`), pensée pour un accès depuis un navigateur classique, pas depuis le Mini App
- Toutes les routes `/api/admin/*` sont protégées par cette clé — la page `/admin` elle-même est publique (juste la coquille HTML), aucune donnée sensible n'y est sans la clé
- Petit changement de comportement au passage : un échec FaucetPay pour **solde insuffisant** (402) ne rembourse plus automatiquement le joueur — le retrait repasse en `pending` et repart tout seul au prochain traitement, plutôt que de faire re-demander tout le monde à cause d'une erreur qui est de ton côté, pas du leur

### Configurer le panel admin

1. `wrangler secret put ADMIN_API_KEY` (encore un secret fort, distinct des autres)
2. Va sur `https://TON_DOMAINE/admin`, colle la clé

Testé : `pnpm install`, `tsc`, `wrangler deploy --dry-run` passent sans erreur. Pas de test end-to-end possible sans vraies ressources Cloudflare déployées, mais la logique HTML/JS est vérifiée (pas d'erreur de syntaxe, pas d'interpolation parasite dans le template).

## Mise en route

```bash
pnpm install
```

### Backend (`apps/api`)

1. `wrangler login`
2. **D1** : `wrangler d1 create memory-match-db` → copie le `database_id` retourné dans `apps/api/wrangler.jsonc`
3. **KV** : `wrangler kv namespace create memory-match-kv` → copie l'`id` retourné (binding `GAME_KV`)
4. **Queue** : `wrangler queues create withdrawal-queue` puis `wrangler queues create withdrawal-queue-dlq`
5. Migrations : `pnpm run db:migrate:local` puis `pnpm run db:migrate:remote`
6. Secrets : `wrangler secret put TELEGRAM_BOT_TOKEN`, `wrangler secret put ADSGRAM_POSTBACK_SECRET`, `wrangler secret put FAUCETPAY_API_KEY`, `wrangler secret put ADMIN_API_KEY` (+ copie `.dev.vars.example` → `.dev.vars` pour le dev local)
7. Types réels : `pnpm run types:api` (remplace le `worker-configuration.d.ts` provisoire)
8. `pnpm run dev:api` → API sur `http://localhost:8787`, teste `GET /health`

### Frontend (`apps/web`)

```bash
pnpm run dev:web
```

Ouvre `http://localhost:5173` **dans un navigateur classique**, avec l'API lancée en parallèle (`pnpm run dev:api` dans un autre terminal) : le jeu est jouable directement en mode "hors Telegram" (utilisateur factice "Joueur", mais les coins/xp/énergie/streak sont bien réels côté serveur — les pubs Adsgram ne se chargeront pas hors Telegram/HTTPS public, c'est normal). Copie `.env.example` → `.env.local` et renseigne les variables `VITE_TELEGRAM_*` et `VITE_ADSGRAM_*` au fur et à mesure que tu crées ton bot et tes blocs Adsgram. Pour tester en conditions réelles dans Telegram, il faut une URL HTTPS publique (déploiement Cloudflare Pages, ou un tunnel type `cloudflared tunnel` / ngrok) enregistrée comme Mini App via @BotFather.

## État du projet

Les 5 phases du plan initial sont faites (jeu, économie serveur anti-triche, streak/parrainage, monétisation Adsgram, retraits FaucetPay), plus un panel admin et une passe de durcissement sécurité. Il reste surtout du travail **de ton côté** (comptes, clés, modération Adsgram) plutôt que du code — voir les sections "Configurer..." ci-dessus, et l'avertissement FaucetPay avant tout paiement réel.

**Phase 7 — Durcissement sécurité**

Fait tel quel (failles réelles ou bonnes pratiques peu coûteuses) :
- Retraits atomiques : `UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?`, vérifié via `meta.changes` — élimine la fenêtre de course entre lecture et écriture du solde (testé : une tentative de forcer un solde négatif est bien rejetée par le nouveau CHECK constraint, voir plus bas)
- Fiabilité de la queue de retraits : un retrait ne passe "queued" qu'**après** confirmation réelle de l'envoi (avant, le statut changeait pour tout le batch avant même d'essayer d'envoyer — un échec au milieu bloquait les suivants indéfiniment)
- Comparaison à temps constant pour le hash HMAC Telegram et la clé admin
- Validation de format d'adresse TRC20 (préfixe + longueur + charset) avant l'appel réseau à FaucetPay, côté serveur ET client
- Rate limiting (KV, approximatif mais suffisant à cette échelle) sur `/api/withdraw`, `/api/auth/telegram`, et l'auth admin
- En-têtes de sécurité (HSTS, CSP, nosniff...) — **scopés différemment** entre l'API JSON et `/admin` (voir plus bas)
- Audit log léger (`audit_log` table) sur les demandes de retrait et les actions admin
- Contraintes CHECK en base (`coins >= 0`, `xp >= 0`, `energy >= 0`) — migration `0002_hardening.sql`, testée en local (reconstruction de table, SQLite ne permet pas d'ALTER TABLE ADD CONSTRAINT)

Adapté (le besoin était réel, l'implémentation demandée aurait cassé l'app) :
- **Anti-replay + fenêtre de fraîcheur courte sur l'initData Telegram** : cassé tel que demandé, parce que ce projet réutilise l'initData brut pour tous les appels d'une session (pas un token à usage unique) — un anti-rejeu strict aurait bloqué le 2e appel API de chaque session, et une fenêtre de 5 min aurait déconnecté n'importe qui après 5 min de jeu. La vraie solution (échanger initData contre un token de session signé une fois, valider ce token ensuite) est un changement d'architecture plus profond, pas fait ici — je l'ai documenté dans `lib/telegram-auth.ts`. En attendant, la fenêtre passe de 24h à 6h, configurable via `INIT_DATA_MAX_AGE_SECONDS`
- **En-têtes de sécurité** : PAS de `X-Frame-Options`/`frame-ancestors` restrictif sur l'API (n'a pas de sens pour du JSON, et le frontend qui EN a besoin est servi ailleurs, sur Cloudflare Pages, donc pas touché par ce Worker). En revanche `/admin` a `frame-ancestors 'none'` — correct et souhaitable pour un dashboard qui ne doit jamais être encadrable

Pas fait (disproportionné pour l'échelle de ce projet — un opérateur, pas une équipe) :
- Lock distribué / clés d'idempotence dédiées pour les retraits — redondant une fois la déduction atomique en place
- Job de récupération toutes les minutes — le nouvel ordre queue-puis-statut résout le même problème plus simplement (retenté au prochain cycle, pas besoin d'un cron dédié)
- JWT + RBAC + rôles + hashing de mots de passe pour l'admin — c'est un système multi-utilisateurs d'entreprise ; toi t'es seul avec une clé. Durcie (temps constant + rate limit) sans construire un système d'auth complet
- Monitoring complet (request IDs, métriques de queue...) — infra disproportionnée à ce stade

Déjà couvert avant cette passe (le prompt d'origine supposait que c'était manquant) :
- Anti-triche serveur et autorité serveur sur coins/xp/streak — c'est l'architecture depuis la Phase 2

Testé : migrations 0001+0002 appliquées en local avec succès, CHECK constraint vérifiée en forçant une écriture invalide (rejetée), FK vers `users` toujours fonctionnelles après reconstruction de table, `tsc` et `wrangler deploy --dry-run` passent sur les deux apps.

Pistes pour la suite si tu veux aller plus loin : tests automatisés, monitoring/alerting sur le Worker, token de session (voir ci-dessus) si tu veux vraiment une fenêtre de fraîcheur courte, authentification admin plus robuste si plusieurs personnes doivent y accéder.

**Phase 8 — Cooldowns visibles + monétisation Monetag**

- Les boutons de reward ad (Adsgram énergie/coins, et maintenant Monetag) affichent un vrai compte à rebours et se désactivent pendant le cooldown, plutôt que de rester cliquables en permanence — c'était la source de la frustration "je regarde une pub et je ne suis pas crédité" (en fait crédité une fois, les fois suivantes tombaient dans le cooldown silencieusement). `/api/me` expose maintenant `adCooldowns` (Adsgram, via KV) fusionné avec les cooldowns Monetag (via D1, table `ad_rewards`, clés préfixées `monetag_` pour ne pas entrer en collision avec les clés Adsgram)
- Écran Tâches : même traitement, message de cooldown au lieu du widget quand non réclamable
- **Monetag** ajouté comme 2e réseau publicitaire, en plus d'Adsgram (pas à la place) : Rewarded Interstitial (+50 coins) et Rewarded Popup (+3 énergie)
- ⚠️ **Point de sécurité important** : Monetag indique explicitement dans sa doc que l'endpoint de postback doit être accessible **sans authentification** de leur côté — ils ne fournissent pas de signature comme certains réseaux CPA (contrairement à Adsgram où j'avais déjà ce réflexe). Le code fourni initialement n'avait donc aucune protection, ce qui aurait permis à n'importe qui connaissant un `telegram_id` de générer des coins gratuits à l'infini avec un `ymid` inventé. Comme pour Adsgram, on écrit nous-mêmes l'URL de postback dans le dashboard Monetag, donc rien n'empêche d'y ajouter notre propre secret statique — c'est ce qui a été ajouté (`MONETAG_POSTBACK_SECRET`, vérifié en temps constant)
- Bug corrigé au passage : le code initial créditait de l'énergie sans mettre à jour `energy_updated_at`, ce qui aurait faussé le calcul de régénération à la lecture suivante

### Configurer Monetag

1. Crée un compte sur Monetag, active le SDK pour ton app, note ta Zone ID
2. `wrangler secret put MONETAG_POSTBACK_SECRET` (encore une valeur aléatoire distincte)
3. Configure l'URL de postback dans le dashboard Monetag pour chaque format, en ajoutant `&secret=TON_SECRET` :
   - Rewarded Interstitial : `https://TON-URL-API/api/monetag/postback?telegram_id={telegram_id}&ymid={ymid}&reward_event_type={reward_event_type}&request_var=earn_coins&secret=TON_SECRET`
   - Rewarded Popup : même URL avec `&request_var=energy_refill`
4. Si ta Zone ID Monetag n'est pas `11369203`, remplace-la dans `apps/web/src/lib/useMonetag.ts` (SDK zone) — c'est un identifiant public (pas un secret), mais il doit correspondre à ton compte

Testé : migrations 0001+0002+0003 appliquées en local avec succès, `tsc` et `vite build` passent sur les deux apps. Le postback Monetag lui-même n'a pas pu être testé en conditions réelles (pas de compte Monetag ni d'accès réseau à leur domaine dans mon environnement) — teste avec un petit montant/déclenchement réel avant de t'y fier pleinement, même logique de prudence que pour FaucetPay.

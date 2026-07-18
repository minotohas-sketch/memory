// Panel admin auto-contenu (HTML + CSS + JS vanilla, aucune étape de build) —
// servi directement par le Worker sur GET /admin. La page elle-même n'a rien
// de sensible ; les données viennent de /api/admin/* protégées par ADMIN_API_KEY.
export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Memory Match — Admin</title>
<style>
  :root {
    --ink: #0b1f1a; --surface: #123b30; --surface-2: #17493c;
    --gold: #e8b75e; --cream: #f3efe4; --sage: #8fa79c; --coral: #e8615e; --mint: #6fcf9e;
  }
  * { box-sizing: border-box; }
  body {
    background: var(--ink); color: var(--cream);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    margin: 0; padding: 24px 16px 60px;
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  h2 { font-size: 1rem; margin: 0; }
  .muted { color: var(--sage); font-size: 0.85rem; }
  .card {
    background: var(--surface); border: 1px solid var(--surface-2);
    border-radius: 14px; padding: 16px; margin-bottom: 12px; max-width: 900px;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
  .stat-label { font-size: 0.72rem; color: var(--sage); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
  .stat-value { font-family: monospace; font-size: 1.3rem; font-weight: bold; color: var(--gold); margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--surface-2); }
  th { color: var(--sage); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; }
  .status-paid { color: var(--mint); }
  .status-failed { color: var(--coral); }
  .status-pending, .status-queued, .status-processing { color: var(--sage); }
  button, select, input {
    font: inherit; background: var(--surface-2); color: var(--cream);
    border: 1px solid var(--surface-2); border-radius: 8px; padding: 8px 12px;
  }
  button { background: var(--gold); color: var(--ink); font-weight: bold; cursor: pointer; border: none; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.secondary { background: transparent; color: var(--cream); border: 1px solid var(--surface-2); font-weight: normal; }
  #login { max-width: 320px; margin: 80px auto; text-align: center; }
  #login input { width: 100%; margin: 12px 0; }
  #login button { width: 100%; }
  .banner {
    background: rgba(232,97,94,0.12); border: 1px solid rgba(232,97,94,0.35);
    border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; font-size: 0.85rem; max-width: 900px;
  }
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
  .hidden { display: none; }
</style>
</head>
<body>

<div id="login">
  <h1>Memory Match — Admin</h1>
  <p class="muted">Clé admin requise</p>
  <input type="password" id="admin-key-input" placeholder="Clé admin" />
  <button id="login-btn">Entrer</button>
  <p id="login-error" class="muted" style="color: var(--coral)"></p>
</div>

<div id="dashboard" class="hidden">
  <h1>Memory Match — Admin</h1>
  <p class="muted" id="last-updated"></p>

  <div id="attention-banner" class="hidden banner"></div>

  <div class="card">
    <div class="grid" id="overview-grid"></div>
  </div>

  <div class="card">
    <p class="stat-label">Solde FaucetPay brut (devise <span id="fp-currency"></span>)</p>
    <p class="stat-value" id="fp-balance">—</p>
    <p class="muted">⚠️ Le multiplicateur exact de conversion n'est pas garanti à 100 % (voir README, section Phase 5) — valeur brute affichée telle quelle, à interpréter avec cette réserve.</p>
  </div>

  <div class="card">
    <div class="toolbar">
      <h2>Retraits</h2>
      <div style="display:flex; gap:8px;">
        <select id="status-filter">
          <option value="">Tous</option>
          <option value="pending">En attente</option>
          <option value="queued">En file</option>
          <option value="processing">En cours</option>
          <option value="paid">Payés</option>
          <option value="failed">Échoués</option>
        </select>
        <button id="process-now-btn">Traiter "en attente" maintenant</button>
      </div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>User</th><th>USDT</th><th>Adresse</th><th>Statut</th><th>Erreur</th></tr></thead>
      <tbody id="withdrawals-body"></tbody>
    </table>
  </div>

  <button class="secondary" id="refresh-btn">Rafraîchir</button>
</div>

<script>
(function () {
  var API_BASE = window.location.origin;
  var adminKey = sessionStorage.getItem('mm_admin_key') || '';

  function el(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str === null || str === undefined ? '' : String(str);
    return div.innerHTML;
  }

  function adminFetch(path, options) {
    options = options || {};
    var headers = Object.assign({ 'X-Admin-Key': adminKey }, options.headers || {});
    return fetch(API_BASE + path, Object.assign({}, options, { headers: headers })).then(function (res) {
      if (!res.ok) throw new Error('http_' + res.status);
      return res.json();
    });
  }

  function statusLabel(s) {
    var map = { pending: 'En attente', queued: 'En file', processing: 'En cours', paid: 'Payé', failed: 'Échoué' };
    return map[s] || s;
  }

  function renderOverview(data) {
    var byStatus = {};
    (data.withdrawalsByStatus || []).forEach(function (w) { byStatus[w.status] = w; });

    var pending = byStatus.pending || { count: 0, total_usdt: 0 };
    var paid = byStatus.paid || { count: 0, total_usdt: 0 };
    var failed = byStatus.failed || { count: 0, total_usdt: 0 };

    var stats = [
      ['Utilisateurs', data.userCount],
      ['Coins en circulation', data.coinsInCirculation.toLocaleString('fr-FR')],
      ['Retraits en attente', pending.count + ' (' + Number(pending.total_usdt).toFixed(2) + ' USDT)'],
      ['Retraits payés', paid.count + ' (' + Number(paid.total_usdt).toFixed(2) + ' USDT)'],
      ['Retraits échoués', failed.count],
    ];
    el('overview-grid').innerHTML = stats.map(function (s) {
      return '<div><p class="stat-label">' + escapeHtml(s[0]) + '</p><p class="stat-value">' + escapeHtml(s[1]) + '</p></div>';
    }).join('');

    var banner = el('attention-banner');
    if (failed.count > 0) {
      banner.classList.remove('hidden');
      banner.textContent = '⚠️ ' + failed.count + ' retrait(s) en échec — regarde le tableau ci-dessous (souvent un solde FaucetPay insuffisant).';
    } else {
      banner.classList.add('hidden');
    }

    el('fp-currency').textContent = (data.faucetPayBalance && data.faucetPayBalance.currency) || '';
    el('fp-balance').textContent = data.faucetPayBalance && data.faucetPayBalance.ok
      ? data.faucetPayBalance.rawBalance
      : 'Indisponible (' + ((data.faucetPayBalance && data.faucetPayBalance.errorMessage) || 'erreur') + ')';
  }

  function renderWithdrawals(list) {
    if (!list.length) {
      el('withdrawals-body').innerHTML = '<tr><td colspan="6" class="muted">Aucun retrait.</td></tr>';
      return;
    }
    el('withdrawals-body').innerHTML = list.map(function (w) {
      var who = w.username ? '@' + w.username : w.telegram_id;
      var shortAddr = w.address.length > 12 ? w.address.slice(0, 10) + '…' : w.address;
      return '<tr>' +
        '<td>' + new Date(w.requested_at).toLocaleDateString('fr-FR') + '</td>' +
        '<td>' + escapeHtml(who) + '</td>' +
        '<td>' + Number(w.usdt_amount).toFixed(2) + '</td>' +
        '<td style="font-family:monospace;font-size:0.75rem;">' + escapeHtml(shortAddr) + '</td>' +
        '<td class="status-' + w.status + '">' + statusLabel(w.status) + '</td>' +
        '<td class="muted">' + escapeHtml(w.error || '') + '</td>' +
        '</tr>';
    }).join('');
  }

  function loadAll() {
    adminFetch('/api/admin/overview').then(renderOverview).catch(function (err) {
      el('last-updated').textContent = 'Erreur : ' + err.message;
    });
    var status = el('status-filter').value;
    adminFetch('/api/admin/withdrawals' + (status ? '?status=' + status : '')).then(function (res) {
      renderWithdrawals(res.withdrawals);
      el('last-updated').textContent = 'Mis à jour : ' + new Date().toLocaleTimeString('fr-FR');
    }).catch(function (err) {
      el('last-updated').textContent = 'Erreur : ' + err.message;
    });
  }

  function showDashboard() {
    el('login').classList.add('hidden');
    el('dashboard').classList.remove('hidden');
    loadAll();
  }

  el('login-btn').addEventListener('click', function () {
    adminKey = el('admin-key-input').value.trim();
    if (!adminKey) return;
    adminFetch('/api/admin/overview').then(function () {
      sessionStorage.setItem('mm_admin_key', adminKey);
      showDashboard();
    }).catch(function () {
      el('login-error').textContent = 'Clé invalide.';
    });
  });

  el('refresh-btn').addEventListener('click', loadAll);
  el('status-filter').addEventListener('change', loadAll);
  el('process-now-btn').addEventListener('click', function () {
    el('process-now-btn').disabled = true;
    adminFetch('/api/admin/withdrawals/process-now', { method: 'POST' }).then(function (res) {
      var msg = res.queuedCount + " retrait(s) mis en queue.";
      if (res.failedCount > 0) msg += " " + res.failedCount + " echec(s) d'envoi, resteront en attente pour le prochain essai.";
      alert(msg);
      loadAll();
    }).catch(function (err) {
      alert('Erreur : ' + err.message);
    }).finally(function () {
      el('process-now-btn').disabled = false;
    });
  });

  if (adminKey) {
    adminFetch('/api/admin/overview').then(showDashboard).catch(function () {
      sessionStorage.removeItem('mm_admin_key');
    });
  }
})();
</script>
</body>
</html>
`;

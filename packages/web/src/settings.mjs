// Settings page: personal access tokens.

import './session.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

async function load() {
  const tokens = await (await fetch('/api/tokens')).json();
  if (!tokens.length) {
    $('tokenList').innerHTML = '<p class="sub">No tokens yet.</p>';
    return;
  }
  $('tokenList').innerHTML = `<table class="projects">
    <thead><tr><th>Name</th><th>Token</th><th>Created</th><th>Expires</th><th>Last used</th><th></th></tr></thead>
    <tbody>${tokens.map((t) => `<tr>
      <td>${esc(t.name)}</td>
      <td><code>${esc(t.hint)}</code></td>
      <td>${date(t.createdAt)}</td>
      <td>${t.expiresAt ? date(t.expiresAt) : 'never'}</td>
      <td>${t.lastUsedAt ? date(t.lastUsedAt) : 'never'}</td>
      <td><button type="button" data-revoke="${esc(t.id)}">Revoke</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const expiry = $('tokenExpiry').value;
  const res = await fetch('/api/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: $('tokenName').value, expiresInDays: expiry ? Number(expiry) : null })
  });
  const body = await res.json();
  if (!res.ok) return showError(body.error || `Failed (${res.status})`);
  $('tokenName').value = '';
  $('newTokenValue').value = body.token;
  $('newTokenExample').textContent = `curl -H "Authorization: Bearer ${body.token}" ${location.origin}/api/projects`;
  $('newToken').hidden = false;
  $('newTokenValue').select();
  await load();
});

$('copyToken').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('newTokenValue').value);
    toast('Token copied');
  } catch {
    $('newTokenValue').select();
    toast('Press Ctrl/Cmd+C to copy');
  }
});

// Two clicks to revoke, without a blocking confirm dialog.
$('tokenList').addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-revoke]');
  if (!button) return;
  if (!button.dataset.armed) {
    button.dataset.armed = '1';
    button.textContent = 'Confirm revoke';
    button.classList.add('danger');
    setTimeout(() => { if (button.isConnected) { delete button.dataset.armed; button.textContent = 'Revoke'; button.classList.remove('danger'); } }, 4000);
    return;
  }
  const res = await fetch(`/api/tokens/${encodeURIComponent(button.dataset.revoke)}`, { method: 'DELETE' });
  if (!res.ok) return showError(`Could not revoke (${res.status})`);
  toast('Token revoked');
  await load();
});

load();

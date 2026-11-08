// Settings page: AI provider keys and personal access tokens.

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

// ---------- AI providers ----------

const INTRO = {
  personal: 'The chat uses your own key with one of these providers. Your key is stored encrypted and can only be used ' +
    'from this browser while you are signed in; signing out deletes it. Tip: create a separate key for this app with a spending limit.',
  managed: 'These AI models are provided by this server.'
};

function aiError(message) {
  $('aiError').textContent = message;
  $('aiError').hidden = !message;
}

async function loadAi() {
  const { mode, providers } = await (await fetch('/api/llm/providers')).json();
  $('aiIntro').textContent = INTRO[mode] || '';
  if (!providers.length) {
    $('aiProviders').innerHTML = '<p class="sub">No AI providers are configured on this server.</p>';
    return;
  }
  $('aiProviders').innerHTML = providers.map((p) => {
    const models = p.models.length ? `<small>${esc(p.models.join(', '))}</small>` : '';
    if (p.credentials !== 'user-key') {
      return `<div class="ai-provider"><div class="ai-name"><b>${esc(p.label)}</b>${models}</div>
        <span class="${p.ready ? 'ok' : 'sub'}">${p.ready ? 'Ready' : esc(p.reason || 'Not available')}</span></div>`;
    }
    const key = p.key
      ? `<span class="ai-key"><code>${esc(p.key.hint)}</code> saved ${date(p.key.createdAt)} · last used ${p.key.lastUsedAt ? date(p.key.lastUsedAt) : 'never'}</span>
         <button type="button" data-remove-key="${esc(p.id)}">Remove</button>`
      : `<form class="ai-key-form" data-provider="${esc(p.id)}">
           <input type="password" placeholder="Paste your ${esc(p.label)} API key" autocomplete="off" spellcheck="false" required>
           <button class="primary" type="submit">Save</button>
         </form>`;
    return `<div class="ai-provider"><div class="ai-name"><b>${esc(p.label)}</b>${models}</div>${key}</div>`;
  }).join('');
}

$('aiProviders').addEventListener('submit', async (e) => {
  const form = e.target.closest('form.ai-key-form');
  if (!form) return;
  e.preventDefault();
  aiError('');
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const res = await fetch(`/api/llm/keys/${encodeURIComponent(form.dataset.provider)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: form.querySelector('input').value })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return aiError(body.error || `Could not save the key (${res.status})`);
    toast('Key checked and saved');
    await loadAi();
  } finally {
    if (form.isConnected) { button.disabled = false; button.textContent = 'Save'; }
  }
});

// Two clicks to remove, like revoking a token.
$('aiProviders').addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-remove-key]');
  if (!button) return;
  if (!button.dataset.armed) {
    button.dataset.armed = '1';
    button.textContent = 'Confirm remove';
    button.classList.add('danger');
    setTimeout(() => { if (button.isConnected) { delete button.dataset.armed; button.textContent = 'Remove'; button.classList.remove('danger'); } }, 4000);
    return;
  }
  const res = await fetch(`/api/llm/keys/${encodeURIComponent(button.dataset.removeKey)}`, { method: 'DELETE' });
  if (!res.ok) return aiError(`Could not remove the key (${res.status})`);
  toast('Key removed');
  await loadAi();
});

loadAi();

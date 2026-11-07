// "Share" dialog: who has access to a project, and (for the owner) changing it:
// people and their roles, invitations by email, share links, general access and the activity log.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };
const ROLE_VERB = { editor: 'edit', viewer: 'view' };
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const date = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const roleSelect = (cls, value, attrs = '') =>
  `<select class="${cls}" ${attrs}><option value="editor"${value === 'editor' ? ' selected' : ''}>Can edit</option><option value="viewer"${value === 'viewer' ? ' selected' : ''}>Can view</option></select>`;

/** One line of the activity log in plain words. */
function describe(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case 'project.create': return 'created the project';
    case 'visibility.set': return d.visibility === 'everyone' ? 'let everyone signed in view it' : 'limited it to the people added';
    case 'member.set': return `${d.previous && d.previous !== 'none' ? 'changed' : 'gave'} ${esc(d.name)} ${ROLE_VERB[d.role]} access`;
    case 'member.remove': return d.self ? 'left the project' : `removed ${esc(d.name)}`;
    case 'link.create': return `created a share link to ${ROLE_VERB[d.role]}`;
    case 'link.revoke': return `revoked a share link${d.removedMembers ? ` (${d.removedMembers} lost access)` : ''}`;
    case 'link.join': return `joined through a share link to ${ROLE_VERB[d.role]}`;
    case 'invite.create': return `invited ${esc(d.email)} to ${ROLE_VERB[d.role]}`;
    case 'invite.remove': return `cancelled the invitation for ${esc(d.email)}`;
    case 'invite.accept': return 'accepted an invitation';
    default: return esc(entry.action);
  }
}

/**
 * Opens the dialog. `role` is the current user's role on the project, `meId` their user id;
 * `onLeft` is called when the user removed their own access.
 */
export async function openShareDialog({ api, projectName, role, meId, onLeft, toast }) {
  const isOwner = role === 'owner';
  document.querySelector('.dialog-panel')?.remove();
  const root = document.createElement('div');
  root.className = 'dialog-panel';
  root.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="shareTitle">
      <div class="dialog-head">
        <h2 id="shareTitle">Share “${esc(projectName)}”</h2>
        <button type="button" class="close" title="Close">✕</button>
      </div>
      ${isOwner ? `
        <div class="share-add">
          <input type="text" class="share-search" placeholder="Add people by name or email" autocomplete="off">
          ${roleSelect('share-new-role', 'editor')}
          <ul class="share-results" hidden></ul>
        </div>` : ''}
      <p class="error" hidden></p>
      <ul class="share-people"></ul>
      <div class="share-visibility"></div>
      ${isOwner ? `
        <div class="share-links">
          <h3>Share links</h3>
          <p class="sub">Anyone who opens a link and signs in joins with its role. Revoking a link removes everyone who joined through it.</p>
          <div class="share-link-new">
            ${roleSelect('share-link-role', 'viewer')}
            <select class="share-link-expiry">
              <option value="7">Can join for 7 days</option>
              <option value="30" selected>Can join for 30 days</option>
              <option value="">No time limit</option>
            </select>
            <button type="button" class="share-link-create">Create link</button>
          </div>
          <div class="share-link-created" hidden>
            <p><b>Copy this link now.</b> It will not be shown again.</p>
            <div class="actions"><input type="text" readonly><button type="button" class="share-link-copy">Copy</button></div>
          </div>
          <ul class="share-link-list"></ul>
        </div>
        <details class="share-log"><summary>Activity</summary><ul></ul></details>` : ''}
    </div>`;
  document.body.append(root);
  const $ = (sel) => root.querySelector(sel);
  const close = () => {
    root.remove();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onOutside, true);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onOutside = (e) => { if (!root.contains(e.target) && !e.target.closest('#shareBtn')) close(); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', onOutside, true);
  $('.close').onclick = close;

  const showError = (message) => { $('.error').textContent = message; $('.error').hidden = !message; };
  async function call(method, path, body) {
    const res = await fetch(`${api}/access${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
    return data;
  }

  function render(access) {
    const rows = [];
    if (access.owner) rows.push(`<li><span class="who">${esc(access.owner.name)}${access.owner.id === meId ? ' (you)' : ''}<small>${esc(access.owner.email || '')}</small></span><span class="role">Owner</span></li>`);
    for (const g of access.grants) {
      const you = g.user.id === meId;
      const via = g.viaLink ? '<span class="tag" title="Joined through a share link">via link</span>' : '';
      const control = isOwner
        ? `${roleSelect('', g.role, `data-user="${esc(g.user.id)}"`)}<button type="button" data-remove="${esc(g.user.id)}" title="Remove access">Remove</button>`
        : `<span class="role">${ROLE_LABEL[g.role]}</span>${you ? `<button type="button" data-remove="${esc(g.user.id)}">Leave</button>` : ''}`;
      rows.push(`<li><span class="who">${esc(g.user.name)}${you ? ' (you)' : ''}${via}<small>${esc(g.user.email || '')}</small></span>${control}</li>`);
    }
    for (const i of access.invites || []) {
      rows.push(`<li><span class="who">${esc(i.email)}<span class="tag" title="Gets access when they sign in with this email">invited</span></span>
        <span class="role">${ROLE_LABEL[i.role]}</span><button type="button" data-cancel-invite="${esc(i.email)}">Cancel</button></li>`);
    }
    $('.share-people').innerHTML = rows.join('');
    $('.share-visibility').innerHTML = isOwner
      ? `<label>General access
           <select class="visibility">
             <option value="private"${access.visibility === 'private' ? ' selected' : ''}>Only people added here</option>
             <option value="everyone"${access.visibility === 'everyone' ? ' selected' : ''}>Everyone signed in can view</option>
           </select></label>`
      : `<p class="sub">${access.visibility === 'everyone' ? 'Everyone signed in can view this project.' : 'Only the people listed here have access.'}</p>`;
    if (isOwner) {
      $('.share-link-list').innerHTML = (access.links || []).map((l) => `<li>
          <span class="who">Link to ${ROLE_VERB[l.role]} · ${l.expiresAt ? `joinable until ${date(l.expiresAt)}` : 'no time limit'}
            <small>created ${date(l.createdAt)} · ${l.members} joined</small></span>
          <button type="button" data-revoke-link="${esc(l.id)}">Revoke</button></li>`).join('');
    }
  }

  async function refresh() { render(await call('GET', '')); }

  async function loadLog() {
    const entries = await call('GET', '/log');
    $('.share-log ul').innerHTML = entries.length
      ? entries.map((e) => `<li><b>${esc(e.actor?.name || 'Someone')}</b> ${describe(e)} <small>${esc(new Date(e.at).toLocaleString())}</small></li>`).join('')
      : '<li class="sub">Nothing yet.</li>';
  }

  root.addEventListener('change', async (e) => {
    showError('');
    try {
      if (e.target.matches('select[data-user]')) render(await call('PUT', `/members/${encodeURIComponent(e.target.dataset.user)}`, { role: e.target.value }));
      if (e.target.matches('select.visibility')) render(await call('PATCH', '', { visibility: e.target.value }));
    } catch (err) { showError(err.message); }
  });

  root.addEventListener('click', async (e) => {
    const target = (sel) => e.target.closest(sel);
    showError('');
    try {
      if (target('button[data-remove]')) {
        const userId = target('button[data-remove]').dataset.remove;
        await call('DELETE', `/members/${encodeURIComponent(userId)}`);
        if (userId === meId) { close(); onLeft?.(); return; }
        await refresh();
      } else if (target('li[data-pick]')) {
        const pick = target('li[data-pick]');
        render(await call('PUT', `/members/${encodeURIComponent(pick.dataset.pick)}`, { role: $('.share-new-role').value }));
        $('.share-search').value = '';
        $('.share-results').hidden = true;
        toast?.(`${pick.dataset.name} added`);
      } else if (target('li[data-invite]')) {
        const email = target('li[data-invite]').dataset.invite;
        const { result, access } = await call('POST', '/invites', { email, role: $('.share-new-role').value });
        render(access);
        $('.share-search').value = '';
        $('.share-results').hidden = true;
        toast?.(result === 'granted' ? `${email} added` : `${email} will get access when they sign in`);
      } else if (target('button[data-cancel-invite]')) {
        await call('DELETE', `/invites/${encodeURIComponent(target('button[data-cancel-invite]').dataset.cancelInvite)}`);
        await refresh();
      } else if (target('.share-link-create')) {
        const expiry = $('.share-link-expiry').value;
        const link = await call('POST', '/links', { role: $('.share-link-role').value, expiresInDays: expiry ? Number(expiry) : null });
        const input = $('.share-link-created input');
        input.value = location.origin + link.path;
        $('.share-link-created').hidden = false;
        input.select();
        await refresh();
      } else if (target('.share-link-copy')) {
        const input = $('.share-link-created input');
        try { await navigator.clipboard.writeText(input.value); toast?.('Link copied'); } catch { input.select(); toast?.('Press Ctrl/Cmd+C to copy'); }
      } else if (target('button[data-revoke-link]')) {
        await call('DELETE', `/links/${encodeURIComponent(target('button[data-revoke-link]').dataset.revokeLink)}`);
        await refresh();
        toast?.('Link revoked');
      } else {
        return;
      }
      if (isOwner && $('.share-log').open) await loadLog();
    } catch (err) { showError(err.message); }
  });

  if (isOwner) {
    $('.share-log').addEventListener('toggle', () => { if ($('.share-log').open) loadLog().catch((err) => showError(err.message)); });
    let timer;
    $('.share-search').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = $('.share-search').value.trim();
        const list = $('.share-results');
        if (q.length < 2) { list.hidden = true; return; }
        const users = (await (await fetch(`/api/users?q=${encodeURIComponent(q)}`)).json()).filter((u) => u.id !== meId);
        const invite = EMAIL_RE.test(q) && !users.some((u) => (u.email || '').toLowerCase() === q.toLowerCase())
          ? `<li data-invite="${esc(q.toLowerCase())}">Invite <b>${esc(q)}</b> <small>gets access when they sign in with this email</small></li>`
          : '';
        list.innerHTML = users.map((u) => `<li data-pick="${esc(u.id)}" data-name="${esc(u.name)}">${esc(u.name)} <small>${esc(u.email || '')}</small></li>`).join('')
          + invite
          || '<li class="none">No one found. Type an email address to invite someone who has not signed in yet.</li>';
        list.hidden = false;
      }, 200);
    });
    $('.share-search').focus();
  }

  try {
    await refresh();
  } catch (err) {
    showError(err.message);
  }
}

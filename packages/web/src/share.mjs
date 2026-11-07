// "Share" dialog: who has access to a project, and (for the owner) changing it.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

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
          <select class="share-new-role"><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
          <ul class="share-results" hidden></ul>
        </div>` : ''}
      <p class="error" hidden></p>
      <ul class="share-people"></ul>
      <div class="share-visibility"></div>
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
      const control = isOwner
        ? `<select data-user="${esc(g.user.id)}"><option value="editor"${g.role === 'editor' ? ' selected' : ''}>Can edit</option><option value="viewer"${g.role === 'viewer' ? ' selected' : ''}>Can view</option></select>
           <button type="button" data-remove="${esc(g.user.id)}" title="Remove access">Remove</button>`
        : `<span class="role">${ROLE_LABEL[g.role]}</span>${you ? `<button type="button" data-remove="${esc(g.user.id)}">Leave</button>` : ''}`;
      rows.push(`<li><span class="who">${esc(g.user.name)}${you ? ' (you)' : ''}<small>${esc(g.user.email || '')}</small></span>${control}</li>`);
    }
    $('.share-people').innerHTML = rows.join('');
    $('.share-visibility').innerHTML = isOwner
      ? `<label>General access
           <select class="visibility">
             <option value="private"${access.visibility === 'private' ? ' selected' : ''}>Only people added here</option>
             <option value="everyone"${access.visibility === 'everyone' ? ' selected' : ''}>Everyone signed in can view</option>
           </select></label>`
      : `<p class="sub">${access.visibility === 'everyone' ? 'Everyone signed in can view this project.' : 'Only the people listed here have access.'}</p>`;
  }

  root.addEventListener('change', async (e) => {
    showError('');
    try {
      if (e.target.matches('select[data-user]')) render(await call('PUT', `/members/${encodeURIComponent(e.target.dataset.user)}`, { role: e.target.value }));
      if (e.target.matches('select.visibility')) render(await call('PATCH', '', { visibility: e.target.value }));
    } catch (err) { showError(err.message); }
  });

  root.addEventListener('click', async (e) => {
    const remove = e.target.closest('button[data-remove]');
    const pick = e.target.closest('li[data-pick]');
    showError('');
    try {
      if (remove) {
        await call('DELETE', `/members/${encodeURIComponent(remove.dataset.remove)}`);
        if (remove.dataset.remove === meId) { close(); onLeft?.(); return; }
        render(await call('GET', ''));
      }
      if (pick) {
        render(await call('PUT', `/members/${encodeURIComponent(pick.dataset.pick)}`, { role: $('.share-new-role').value }));
        $('.share-search').value = '';
        $('.share-results').hidden = true;
        toast?.(`${pick.dataset.name} added`);
      }
    } catch (err) { showError(err.message); }
  });

  if (isOwner) {
    let timer;
    $('.share-search').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = $('.share-search').value.trim();
        const list = $('.share-results');
        if (q.length < 2) { list.hidden = true; return; }
        const users = (await (await fetch(`/api/users?q=${encodeURIComponent(q)}`)).json()).filter((u) => u.id !== meId);
        list.innerHTML = users.length
          ? users.map((u) => `<li data-pick="${esc(u.id)}" data-name="${esc(u.name)}">${esc(u.name)} <small>${esc(u.email || '')}</small></li>`).join('')
          : '<li class="none">No one found. People appear here after they signed in once.</li>';
        list.hidden = false;
      }, 200);
    });
    $('.share-search').focus();
  }

  try {
    render(await call('GET', ''));
  } catch (err) {
    showError(err.message);
  }
}

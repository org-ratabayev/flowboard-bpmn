// Project list page. (A module rather than an inline script, so the page can forbid inline scripts.)

import './session.mjs';

const listEl = document.getElementById('list');
const nameEl = document.getElementById('newName');

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ACCESS = { owner: 'You own it', editor: 'Can edit', viewer: 'Can view' };
let filter = 'all';

function accessCell(p) {
  const owner = p.role === 'owner' ? '' : ` · ${esc(p.owner?.name || 'no owner')}`;
  const everyone = p.visibility === 'everyone' ? '<span class="tag" title="Everyone signed in can view">Everyone</span>' : '';
  return `<span class="access">${ACCESS[p.role] || ''}${owner}${everyone}</span>`;
}

document.getElementById('filters').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  for (const b of document.querySelectorAll('#filters button')) b.classList.toggle('active', b === button);
  load();
});

async function load() {
  const res = await fetch('/api/projects');
  const all = await res.json();
  const projects = all.filter((p) => filter === 'all' || (filter === 'mine' ? p.role === 'owner' : p.role !== 'owner'));
  if (!projects.length) {
    listEl.innerHTML = `<div class="empty">${all.length
      ? 'No projects here.'
      : 'No projects yet. Create a new diagram or import an existing .bpmn file.'}</div>`;
    return;
  }
  listEl.innerHTML = `
    <table class="projects">
      <thead><tr><th>Name</th><th>Access</th><th>Last saved</th><th>By</th><th>Versions</th><th></th></tr></thead>
      <tbody>
        ${projects.map((p) => `
          <tr>
            <td><a href="/p/${encodeURIComponent(p.id)}">${esc(p.name)}</a></td>
            <td>${accessCell(p)}</td>
            <td>${esc(fmt(p.updatedAt))}</td>
            <td>${esc(p.updatedBy || '—')}</td>
            <td class="num">${p.versionCount}</td>
            <td><a href="/api/projects/${encodeURIComponent(p.id)}/download">Download</a></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function create(name, xml) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, xml })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed');
  return body.id;
}

document.getElementById('createBtn').onclick = async () => {
  const name = nameEl.value.trim() || 'Untitled diagram';
  try {
    const id = await create(name);
    location.href = `/p/${encodeURIComponent(id)}`;
  } catch (e) { toast(e.message); }
};
nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('createBtn').click(); });

const fileEl = document.getElementById('importFile');
document.getElementById('importBtn').onclick = () => fileEl.click();
fileEl.onchange = async () => {
  let ok = 0;
  for (const file of fileEl.files) {
    try {
      await create(file.name.replace(/\.(bpmn|xml)$/i, ''), await file.text());
      ok++;
    } catch (e) { toast(`${file.name}: ${e.message}`); }
  }
  fileEl.value = '';
  if (ok) toast(`Imported ${ok} file${ok > 1 ? 's' : ''}`);
  load();
};

load();

// Library styles first, our own last so it can override them (same order as before bundling).
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import 'bpmn-js-color-picker/colors/color-picker.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import 'bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css';
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css';
import 'diagram-js-minimap/assets/diagram-js-minimap.css';
import './styles.css';

import BpmnJS from 'bpmn-js/lib/Modeler';
import BpmnColorPickerModule from 'bpmn-js-color-picker';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import BpmnlintModule from 'bpmn-js-bpmnlint';
import TokenSimulationModule from 'bpmn-js-token-simulation';
import MinimapModule from 'diagram-js-minimap';
import { diff } from 'bpmn-js-differ';
import { layoutProcess } from 'bpmn-auto-layout';
import lintConfig from './lint-config.mjs';
import { me } from './session.mjs';
import { createReadOnly } from './readOnly.mjs';
import { createZoomControls } from './zoomControls.mjs';
import { openShareDialog } from './share.mjs';
import { createLive } from './live.mjs';
import { createChatPanel } from './chat/panel.mjs';
import { createProposals } from './chat/proposal.mjs';
import { createChatTools } from './chat/tools.mjs';

const id = decodeURIComponent(location.pathname.split('/')[2]);
const api = `/api/projects/${encodeURIComponent(id)}`;
const $ = (sel) => document.getElementById(sel);

const prefs = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`bpmn-${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`bpmn-${key}`, JSON.stringify(value)); } catch {}
  }
};

const modeler = new BpmnJS({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  linting: { bpmnlint: lintConfig, active: prefs.get('lint', false) },
  additionalModules: [
    BpmnColorPickerModule,
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    BpmnlintModule,
    TokenSimulationModule,
    MinimapModule
  ]
});

modeler.on('linting.toggle', ({ active }) => prefs.set('lint', active));

createZoomControls(modeler.get('canvas'), document.getElementById('canvas'));
const readOnly = createReadOnly(modeler, { propertiesEl: document.getElementById('properties') });

const state = {
  baseVersion: null,  // latest version this editor is based on
  viewing: null,      // history version currently shown, null = latest
  dirty: false,
  importing: false,
  saving: false,
  versions: [],
  publishPending: false, // a local change is waiting to be shared with other participants
  role: 'owner',        // the user's role on this project: owner, editor or viewer
  warnedViewOnly: false
};

const ROLE_BADGE = { owner: '', editor: 'Can edit', viewer: 'View only' };

/** Shows what the user may do; viewers cannot save or share changes with others (they may chat about the diagram). */
function applyRole(role) {
  state.role = role;
  const viewer = role === 'viewer';
  $('roleBadge').textContent = ROLE_BADGE[role] || '';
  $('roleBadge').hidden = !ROLE_BADGE[role];
  $('roleBadge').className = `role-badge role-${role}`;
  $('save').hidden = viewer;
  $('name').readOnly = role !== 'owner' && role !== 'editor';
  document.querySelector('[data-action="layout"]').hidden = viewer;
  readOnly.set(viewer);
  chatPanel?.roleChanged();
}

/** The owner changed our role while the project is open (live event, or noticed on reconnect). */
async function onAccessChanged(role) {
  const previous = state.role;
  if (role === previous) return;
  applyRole(role);
  updateStatus();
  if (role !== 'viewer') {
    toast(previous === 'viewer' ? 'You can now edit this project' : `Your role changed: ${ROLE_BADGE[role] || 'owner'}`);
    return;
  }
  if (!state.dirty) {
    toast('Your access changed to view only');
    return;
  }
  // unsaved changes stay in the browser, but can no longer be saved here
  showBanner('Your access changed to <b>view only</b>. Your unsaved changes cannot be saved anymore.', [
    ['Download my changes', async () => {
      const { xml } = await modeler.saveXML({ format: true });
      downloadBlob(new Blob([xml], { type: 'application/xml' }), `${id}-my-changes.bpmn`);
    }, true],
    ['Discard them', () => loadLatest({ fit: false })]
  ]);
}

/** Our access to the project was removed while it was open. */
function onAccessRevoked() {
  modeler.destroy();
  document.body.className = '';
  document.body.innerHTML = `<div class="page"><h1>You no longer have access</h1>
    <p class="sub">The owner removed your access to this project.</p><p><a href="/">Back to your projects</a></p></div>`;
}

let live = null;      // live collaboration client, connected after the first load

// ---------- helpers ----------

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString() : '';
}

function versionDate(v) {
  // 2026-11-05T12-33-08-123Z -> ISO
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function setStatus(text, cls = '') {
  const s = $('status');
  s.textContent = text;
  s.className = `status ${cls}`;
}

function updateStatus() {
  if (state.role === 'viewer') setStatus(state.dirty ? 'View only: your changes are not saved' : '', state.dirty ? 'dirty' : '');
  else if (state.viewing) setStatus(state.dirty ? 'Unsaved changes (based on old version)' : 'Viewing old version', 'dirty');
  else if (state.dirty) setStatus('Unsaved changes', 'dirty');
  else setStatus('All changes saved', 'ok');
  $('save').textContent = state.viewing ? 'Restore this version' : 'Save';
}

let bannerOwner = null; // the proposal the banner currently shows, if any

function showBanner(msg, actions, owner = null) {
  bannerOwner = owner;
  $('bannerMsg').innerHTML = msg;
  const box = $('bannerActions');
  box.innerHTML = '';
  for (const [label, fn, primary] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.onclick = fn;
    box.appendChild(b);
  }
  $('banner').classList.add('show');
}

function hideBanner() { bannerOwner = null; $('banner').classList.remove('show'); }

function hasLayout(xml) {
  return /<([\w-]+:)?BPMNShape[\s>]/.test(xml);
}

// Imports a diagram; files without diagram layout (DI) get one generated by bpmn-auto-layout.
async function importXml(xml) {
  let generated = false;
  if (!hasLayout(xml)) {
    try {
      xml = await layoutProcess(xml);
      generated = true;
    } catch (e) {
      console.warn('Auto-layout failed', e);
    }
  }
  state.importing = true;
  try {
    const { warnings } = await modeler.importXML(xml);
    if (warnings.length) console.warn('Import warnings', warnings);
  } finally {
    state.importing = false;
  }
  return { generated };
}

modeler.on('commandStack.changed', () => {
  if (state.importing) return;
  state.dirty = true;
  updateStatus();
  if (state.role === 'viewer' && !state.warnedViewOnly) {
    state.warnedViewOnly = true;
    showBanner('You can view this project but not change it. Changes you make here are not saved or shown to others.', [['Discard my changes', () => loadLatest({ fit: false }), true]]);
  }
  schedulePublish();
});

// ---------- live collaboration ----------

const PUBLISH_DELAY_MS = 250;
let publishTimer = null;
let queuedRemote = null;
const interaction = { dragging: false, directEditing: false };

// Shares the current diagram with other participants shortly after a local change.
function schedulePublish() {
  if (!live || state.viewing || state.role === 'viewer') return;
  state.publishPending = true;
  clearTimeout(publishTimer);
  publishTimer = setTimeout(publishNow, PUBLISH_DELAY_MS);
}

async function publishNow() {
  clearTimeout(publishTimer);
  if (!live || state.viewing) { state.publishPending = false; return; }
  const { xml } = await modeler.saveXML({ format: true });
  state.publishPending = false;
  queuedRemote = null; // our newer version replaces anything received meanwhile
  await live.publishDoc(xml);
}

function isInteracting() {
  // while the assistant edits, changes from others wait (applying them would clear the undo history)
  return interaction.dragging || interaction.directEditing || $('properties').contains(document.activeElement) || !!chatPanel?.busy;
}

// Applies a diagram produced by another participant, keeping our viewport and selection.
async function applyRemote(update) {
  if (state.viewing || state.publishPending) return; // "Back to latest" fetches it; or our pending edit wins
  if (isInteracting()) { queuedRemote = update; return; }
  queuedRemote = null;
  const canvas = modeler.get('canvas');
  const viewbox = canvas.viewbox();
  const selected = modeler.get('selection').get().map((el) => el.id);
  await importXml(update.xml);
  canvas.viewbox(viewbox);
  const registry = modeler.get('elementRegistry');
  modeler.get('selection').select(selected.map((sid) => registry.get(sid)).filter(Boolean));
  state.dirty = update.dirty;
  updateStatus();
}

function applyQueuedRemote() {
  if (queuedRemote && !isInteracting()) applyRemote(queuedRemote);
}

modeler.on('drag.start', () => { interaction.dragging = true; });
modeler.on('drag.cleanup', () => { interaction.dragging = false; setTimeout(applyQueuedRemote, 0); });
modeler.on('directEditing.activate', () => { interaction.directEditing = true; });
for (const event of ['directEditing.deactivate', 'directEditing.complete', 'directEditing.cancel']) {
  modeler.on(event, () => { interaction.directEditing = false; setTimeout(applyQueuedRemote, 0); });
}
$('properties').addEventListener('focusout', () => setTimeout(applyQueuedRemote, 0));

function startLive() {
  live = createLive({
    api,
    modeler,
    avatarsEl: $('participants'),
    onHello: async (hello, previousRev) => {
      if (state.viewing) return;
      if (hello.xml && hello.rev !== previousRev) {
        await applyRemote({ xml: hello.xml, rev: hello.rev, dirty: hello.rev !== hello.savedRev });
      } else if (!hello.xml && hello.rev === 0 && state.dirty) {
        publishNow(); // the server restarted and lost the shared draft: share ours again
      }
    },
    onDoc: (update) => applyRemote(update),
    onAccess: onAccessChanged,
    onRevoked: onAccessRevoked,
    onSaved: async (saved) => {
      state.baseVersion = saved.version;
      if (saved.by === live.me.id) return; // our own save, handled in save()
      if (!state.viewing && !state.publishPending) {
        const { xml } = await modeler.saveXML({ format: true });
        if (xml !== saved.xml) await applyRemote({ xml: saved.xml, rev: saved.rev, dirty: false });
        state.dirty = false;
        proposals.reset();
      }
      updateStatus();
      toast(`Saved by ${saved.author || 'someone'}`);
      if ($('history').classList.contains('show')) renderHistory();
    }
  });
}

// ---------- load / save ----------

async function loadLatest({ fit = true } = {}) {
  const res = await fetch(api);
  if (res.status === 404) {
    document.body.innerHTML = '<div class="page"><h1>Project not found</h1><p><a href="/">Back to projects</a></p></div>';
    return;
  }
  const p = await res.json();
  document.title = `${p.name} · BPMN`;
  $('name').value = p.name;
  applyRole(p.role);
  state.warnedViewOnly = false;
  const viewbox = fit ? null : modeler.get('canvas').viewbox();
  const { generated } = await importXml(p.xml);
  if (fit) modeler.get('canvas').zoom('fit-viewport', 'auto');
  else modeler.get('canvas').viewbox(viewbox);
  state.baseVersion = p.version;
  state.viewing = null;
  state.dirty = generated || p.dirty;
  proposals.reset();
  if (live) {
    live.rev = p.rev;
    live.setViewing(null);
  }
  hideBanner();
  updateStatus();
  if (generated) toast('This file had no diagram layout. One was generated: save to keep it.');
  if ($('history').classList.contains('show')) renderHistory();
}

/** Save button and Ctrl/Cmd+S: after AI changes, first shows the version note to confirm or edit. */
function requestSave() {
  if (state.saving || state.role === 'viewer' || $('saveDialog').open) return;
  const aiNote = state.viewing ? '' : proposals.note();
  if (!aiNote) return save();
  $('saveNote').value = aiNote;
  $('saveDialog').showModal();
  $('saveNote').focus();
}

async function save({ force = false, note } = {}) {
  if (state.saving || state.role === 'viewer') return;
  state.saving = true;
  $('save').disabled = true;
  setStatus('Saving…');
  try {
    const { xml } = await modeler.saveXML({ format: true });
    note ??= state.viewing ? `Restored version from ${fmt(versionDate(state.viewing))}` : null;
    // the save itself shares this diagram with everyone, so a pending share is no longer needed
    clearTimeout(publishTimer);
    state.publishPending = false;
    const res = await fetch(api, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml, baseVersion: state.baseVersion, note, force, client: live?.me.id })
    });
    const body = await res.json();
    if (res.status === 409) {
      const who = body.latest?.author ? ` by <b>${esc(body.latest.author)}</b>` : '';
      showBanner(
        `Someone saved a newer version${who} at ${esc(fmt(body.latest?.at))} while you were editing. Both versions are kept in history either way.`,
        [
          ['Load their version (discard mine)', () => loadLatest({ fit: false })],
          ['Save mine on top', () => save({ force: true, note }), true]
        ]
      );
      updateStatus();
      return;
    }
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    state.baseVersion = body.version;
    if (live) {
      live.rev = body.rev;
      if (state.viewing) live.setViewing(null);
    }
    state.viewing = null;
    state.dirty = false;
    proposals.saved();
    hideBanner();
    updateStatus();
    toast('Saved');
    if ($('history').classList.contains('show')) renderHistory();
  } catch (e) {
    setStatus(`Save failed: ${e.message}`, 'error');
  } finally {
    state.saving = false;
    $('save').disabled = false;
  }
}

// ---------- history ----------

async function fetchVersionXml(version) {
  const res = await fetch(`${api}/history/${encodeURIComponent(version)}`);
  if (!res.ok) throw new Error('Could not load version');
  return (await res.json()).xml;
}

async function renderHistory() {
  const res = await fetch(`${api}/history`);
  state.versions = await res.json();
  const list = $('historyList');
  list.innerHTML = state.versions.map((v, i) => `
    <li data-version="${esc(v.version)}" class="${(state.viewing || state.baseVersion) === v.version ? 'active' : ''}">
      <div class="when">${esc(fmt(v.at || versionDate(v.version)))}${i === 0 ? '<span class="tag">latest</span>' : ''}</div>
      <div class="meta">${esc(v.author || 'anonymous')}${v.note ? ' · ' + esc(v.note) : ''}</div>
      <div class="links">
        ${i < state.versions.length - 1 ? '<a href="#" data-action="changes">what changed</a>' : ''}
        <a href="${api}/download?version=${encodeURIComponent(v.version)}" data-action="download">download</a>
      </div>
    </li>`).join('') || '<li>No history yet</li>';
  for (const li of list.querySelectorAll('li[data-version]')) {
    li.onclick = (e) => {
      const action = e.target.dataset?.action;
      if (action === 'download') return;
      e.preventDefault();
      if (action === 'changes') showChanges(li.dataset.version);
      else viewVersion(li.dataset.version);
    };
  }
}

async function viewVersion(version, { confirmDiscard = true } = {}) {
  if (confirmDiscard && state.dirty && !confirm('You have unsaved changes. Discard them and view this version?')) return false;
  if (version === state.versions[0]?.version) {
    await loadLatest({ fit: false });
    return true;
  }
  let xml;
  try { xml = await fetchVersionXml(version); } catch (e) { toast(e.message); return false; }
  clearTimeout(publishTimer);
  state.publishPending = false;
  proposals.reset();
  await importXml(xml);
  state.viewing = version;
  state.dirty = false;
  live?.setViewing(version);
  showBanner(
    `Viewing version from <b>${esc(fmt(versionDate(version)))}</b>. Click “Restore this version” to save it as the newest version.`,
    [['Back to latest', () => loadLatest({ fit: false })]]
  );
  updateStatus();
  renderHistory();
  return true;
}

// ---------- diff ("what changed") ----------

function elementLabel(el) {
  const type = (el.$type || '').replace(/^bpmn:/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return el.name ? `${type} “${el.name}”` : `${type} ${el.id}`;
}

async function showChanges(version) {
  const idx = state.versions.findIndex((v) => v.version === version);
  const previous = state.versions[idx + 1];
  if (!previous) return;
  if (state.dirty && !confirm('You have unsaved changes. Discard them and show this version\'s changes?')) return;

  let oldXml;
  try { oldXml = await fetchVersionXml(previous.version); } catch (e) { return toast(e.message); }
  if (!(await viewVersion(version, { confirmDiscard: false }))) return;

  const moddle = modeler.get('moddle');
  const { xml: newXml } = await modeler.saveXML();
  const [{ rootElement: oldDefs }, { rootElement: newDefs }] = await Promise.all([moddle.fromXML(oldXml), moddle.fromXML(newXml)]);
  const changes = diff(oldDefs, newDefs);

  const canvas = modeler.get('canvas');
  const registry = modeler.get('elementRegistry');
  const mark = (ids, cls) => {
    let n = 0;
    for (const elId of ids) {
      if (registry.get(elId)) { canvas.addMarker(elId, cls); n++; }
    }
    return n;
  };
  const added = mark(Object.keys(changes._added), 'diff-added');
  const changed = mark(Object.keys(changes._changed), 'diff-changed');
  const moved = mark(Object.keys(changes._layoutChanged).filter((k) => !changes._changed[k] && !changes._added[k]), 'diff-moved');
  const removed = Object.values(changes._removed).filter((el) => el.$type && !/^bpmndi:|^dc:|^di:/.test(el.$type));

  const changedDetails = Object.values(changes._changed)
    .filter((c) => registry.get(c.model.id))
    .map((c) => `${esc(elementLabel(c.model))}: ${esc(Object.keys(c.attrs).join(', '))}`);

  const parts = [
    `<span class="diff-legend added">${added} added</span>`,
    `<span class="diff-legend changed" title="${esc(changedDetails.join('\n'))}">${changed} changed</span>`,
    `<span class="diff-legend moved">${moved} moved</span>`,
    `<span class="diff-legend removed">${removed.length} removed</span>`
  ];
  const removedList = removed.length ? `<br>Removed: ${removed.map((el) => esc(elementLabel(el))).join(', ')}` : '';
  const isLatest = version === state.versions[0]?.version;
  showBanner(
    `Changes in version from <b>${esc(fmt(versionDate(version)))}</b> compared to the version before: ${parts.join(' ')}${removedList}`,
    isLatest
      ? [['Hide changes', () => loadLatest({ fit: false })]]
      : [['Back to latest', () => loadLatest({ fit: false })]]
  );
}

// ---------- export ----------

async function exportSvg() {
  const { svg } = await modeler.saveSVG();
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${id}.svg`);
}

async function exportPng() {
  const { svg } = await modeler.saveSVG();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    downloadBlob(blob, `${id}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportBpmn() {
  const { xml } = await modeler.saveXML({ format: true });
  downloadBlob(new Blob([xml], { type: 'application/xml' }), `${id}.bpmn`);
}

async function autoLayout() {
  if (!confirm('Re-arrange the whole diagram automatically?\n\nAll element positions are replaced. Pools, lanes and colors may be lost. Nothing is saved until you click Save.')) return;
  try {
    const { xml: before } = await modeler.saveXML();
    const viewbox = modeler.get('canvas').viewbox();
    const laidOut = await layoutProcess(before);
    // re-importing clears the undo stack, so the banner offers its own undo
    await importXml(laidOut);
    modeler.get('canvas').zoom('fit-viewport', 'auto');
    state.dirty = true;
    updateStatus();
    schedulePublish();
    showBanner('Diagram was re-arranged automatically. Save to keep it.', [
      ['Undo auto-layout', async () => {
        await importXml(before);
        modeler.get('canvas').viewbox(viewbox);
        hideBanner();
        schedulePublish();
      }]
    ]);
  } catch (e) {
    toast(`Auto-layout failed: ${e.message}`);
  }
}

// ---------- chat ----------

/** Replaces the whole diagram for the assistant (bpmn_replace_xml), keeping the viewport. */
async function replaceDiagram(xml) {
  const viewbox = modeler.get('canvas').viewbox();
  await proposals.replacing(() => importXml(xml));
  modeler.get('canvas').viewbox(viewbox);
  state.dirty = true;
  updateStatus();
  schedulePublish();
}

const proposals = createProposals({
  modeler,
  confirm: (message) => confirm(message),
  restore: replaceDiagram
});

const chatTools = createChatTools({
  modeler,
  lintConfig,
  isReadOnly: () => readOnly.active,
  beforeEdit: (name, turn) => proposals.begin(turn),
  onSummary: (summary, turn) => proposals.setSummary(turn, summary),
  replaceDiagram
});

proposals.onChange((proposal) => {
  if (proposal.status === 'ready') {
    showBanner(`The assistant changed the diagram (highlighted): <b>${esc(proposal.summary?.title || '')}</b>. Keep the changes or undo them; nothing is saved yet.`, [
      ['Undo', () => proposals.undo(proposal)],
      ['Keep', () => proposals.keep(proposal), true]
    ], proposal);
  } else if (bannerOwner === proposal) {
    hideBanner();
  }
});

const chatPanel = createChatPanel({
  api,
  $,
  tools: chatTools,
  proposals,
  role: () => state.role,
  toast,
  onTurnEnd: () => setTimeout(applyQueuedRemote, 0)
});

// ---------- wiring ----------

function togglePanel(panelId, prefKey, force) {
  const el = $(panelId);
  const show = force ?? !el.classList.contains('show');
  el.classList.toggle('show', show);
  if (prefKey) prefs.set(prefKey, show);
  return show;
}

togglePanel('properties', null, prefs.get('properties', true));

$('save').onclick = () => requestSave();
$('saveForm').addEventListener('submit', (e) => {
  e.preventDefault();
  $('saveDialog').close();
  save({ note: $('saveNote').value.trim() || null });
});
$('saveCancel').onclick = () => $('saveDialog').close();
$('shareBtn').onclick = async () => {
  const user = await me;
  openShareDialog({
    api,
    projectName: $('name').value,
    role: state.role,
    meId: user.id,
    toast,
    onLeft: () => { location.href = '/'; }
  });
};

$('historyBtn').onclick = () => { if (togglePanel('history')) renderHistory(); };
$('closeHistory').onclick = () => togglePanel('history', null, false);
$('propertiesBtn').onclick = () => togglePanel('properties', 'properties');
$('chatBtn').onclick = async () => {
  if (togglePanel('chat')) {
    await chatPanel.open();
    $('chatInput').focus();
  }
};
$('closeChat').onclick = () => togglePanel('chat', null, false);

const menu = $('moreMenu');
$('moreBtn').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('show'); };
document.addEventListener('click', () => menu.classList.remove('show'));
const menuActions = { bpmn: exportBpmn, svg: exportSvg, png: exportPng, layout: autoLayout };
for (const item of menu.querySelectorAll('[data-action]')) {
  item.onclick = () => {
    menu.classList.remove('show');
    menuActions[item.dataset.action]().catch((e) => toast(e.message));
  };
}

$('name').addEventListener('change', async () => {
  const name = $('name').value.trim();
  if (!name) return;
  const res = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (res.ok) { document.title = `${name} · BPMN`; toast('Renamed'); }
});
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    requestSave();
  }
});
window.addEventListener('beforeunload', (e) => {
  // shared unsaved changes stay on the server for others; warn when they would only exist here
  if (state.publishPending || (state.dirty && state.viewing) || (state.dirty && !live?.connected)) {
    e.preventDefault();
    e.returnValue = '';
  }
});

$('chatBtn').hidden = true;
chatPanel.available().then((ok) => { $('chatBtn').hidden = !ok; });

loadLatest().then(startLive);

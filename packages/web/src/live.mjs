// Live collaboration client: connection, participant avatars, remote cursors and selections.
// The editor decides what to do with shared diagram updates via the onHello/onDoc/onSaved callbacks.

const CURSOR_INTERVAL_MS = 60;
const CURSOR_TTL_MS = 30 * 1000;
const MAX_AVATARS = 8;

function clientId() {
  try {
    let cid = sessionStorage.getItem('bpmn-client');
    if (!cid) {
      cid = crypto.randomUUID().replace(/-/g, '');
      sessionStorage.setItem('bpmn-client', cid);
    }
    return cid;
  } catch {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

const STATUS_LABEL = {
  editing: 'editing',
  viewing: 'viewing',
  'viewing-old': 'viewing an old version',
  away: 'away'
};

export function createLive({ api, modeler, avatarsEl, onHello, onDoc, onSaved, onAccess, onRevoked }) {
  const canvas = modeler.get('canvas');
  const overlays = modeler.get('overlays');
  const registry = modeler.get('elementRegistry');
  const container = canvas.getContainer();

  const live = {
    me: { id: clientId(), name: '', color: '#888' },
    rev: 0,
    connected: false,
    participants: []
  };
  const cursors = new Map(); // participant id -> { el, x, y, seen }
  let source = null;

  const layer = document.createElement('div');
  layer.className = 'live-cursors';
  container.appendChild(layer);

  // ---------- transport ----------

  function post(body) {
    return fetch(`${api}/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: live.me.id, ...body })
    }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))).catch(() => ({ ok: false, data: {} }));
  }

  function connect() {
    source = new EventSource(`${api}/live?client=${live.me.id}`); // the server knows who we are
    source.addEventListener('hello', (e) => {
      const data = JSON.parse(e.data);
      const previousRev = live.rev;
      live.connected = true;
      if (data.you.role) onAccess?.(data.you.role); // also catches changes missed while disconnected
      live.me = data.you;
      live.rev = data.rev;
      updateParticipants(data.participants);
      sendPresence();
      onHello(data, previousRev);
    });
    source.addEventListener('presence', (e) => updateParticipants(JSON.parse(e.data).participants));
    source.addEventListener('cursor', (e) => {
      const { id, cursor } = JSON.parse(e.data);
      setCursor(id, cursor);
    });
    source.addEventListener('doc', (e) => {
      const data = JSON.parse(e.data);
      live.rev = data.rev;
      onDoc(data);
    });
    // the owner changed our role: the editor adapts without a reload
    source.addEventListener('access', (e) => onAccess?.(JSON.parse(e.data).role));
    source.addEventListener('access-revoked', () => {
      source.close(); // no reconnecting: the project is gone for us
      live.connected = false;
      onRevoked?.();
    });
    source.addEventListener('saved', (e) => {
      const data = JSON.parse(e.data);
      live.rev = data.rev;
      onSaved(data);
    });
    source.onerror = () => { live.connected = false; }; // EventSource reconnects by itself
  }

  // ---------- presence ----------

  let viewing = null;

  function sendPresence(extra = {}) {
    const selection = modeler.get('selection').get().map((el) => el.id);
    post({ type: 'presence', selection, viewing, active: !document.hidden, ...extra });
  }

  function updateParticipants(list) {
    live.participants = list;
    const others = new Set(list.filter((p) => p.id !== live.me.id).map((p) => p.id));
    for (const [pid, c] of cursors) {
      if (!others.has(pid)) { c.el.remove(); cursors.delete(pid); }
    }
    for (const p of list) {
      if (p.id !== live.me.id && p.cursor && !cursors.has(p.id)) setCursor(p.id, p.cursor);
    }
    renderAvatars();
    renderSelections();
  }

  function renderAvatars() {
    const me = live.participants.find((p) => p.id === live.me.id);
    const others = live.participants.filter((p) => p.id !== live.me.id);
    const list = (me ? [me] : []).concat(others);
    avatarsEl.innerHTML = '';
    list.slice(0, MAX_AVATARS).forEach((p) => {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = `avatar status-${p.status}${p.id === live.me.id ? ' me' : ''}`;
      a.style.background = p.color;
      a.textContent = initials(p.name);
      a.title = `${p.name}${p.id === live.me.id ? ' (you)' : ''} · ${STATUS_LABEL[p.status] || p.status}`;
      if (p.id !== live.me.id) a.onclick = () => jumpTo(p);
      avatarsEl.appendChild(a);
    });
    if (list.length > MAX_AVATARS) {
      const more = document.createElement('span');
      more.className = 'avatar more';
      more.textContent = `+${list.length - MAX_AVATARS}`;
      more.title = list.slice(MAX_AVATARS).map((p) => p.name).join(', ');
      avatarsEl.appendChild(more);
    }
  }

  // centers the view on a participant's cursor, or on what they selected
  function jumpTo(p) {
    let point = p.cursor || cursors.get(p.id);
    if (!point || point.x == null) {
      const el = p.selection.map((sid) => registry.get(sid)).find(Boolean);
      if (!el) return;
      point = el.waypoints ? el.waypoints[0] : { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    }
    const vb = canvas.viewbox();
    canvas.viewbox({ x: point.x - vb.width / 2, y: point.y - vb.height / 2, width: vb.width, height: vb.height });
  }

  // ---------- remote cursors ----------

  function setCursor(pid, cursor) {
    let c = cursors.get(pid);
    if (!cursor) {
      if (c) { c.el.remove(); cursors.delete(pid); }
      return;
    }
    const p = live.participants.find((x) => x.id === pid);
    if (!c) {
      const el = document.createElement('div');
      el.className = 'live-cursor';
      el.innerHTML = '<svg width="18" height="20" viewBox="0 0 18 20"><path d="M2 1 L2 16 L6 12 L9 19 L12 18 L9 11 L15 11 Z" stroke="#fff" stroke-width="1.2"/></svg><span class="live-cursor-name"></span>';
      layer.appendChild(el);
      c = { el };
      cursors.set(pid, c);
    }
    const color = p?.color || '#888';
    c.el.querySelector('path').setAttribute('fill', color);
    const label = c.el.querySelector('.live-cursor-name');
    label.style.background = color;
    label.textContent = p?.name || '';
    c.x = cursor.x;
    c.y = cursor.y;
    c.seen = Date.now();
    positionCursor(c);
  }

  function positionCursor(c) {
    const vb = canvas.viewbox();
    c.el.style.transform = `translate(${(c.x - vb.x) * vb.scale}px, ${(c.y - vb.y) * vb.scale}px)`;
  }

  modeler.on('canvas.viewbox.changed', () => cursors.forEach(positionCursor));

  setInterval(() => {
    const now = Date.now();
    for (const [pid, c] of cursors) {
      if (now - c.seen > CURSOR_TTL_MS) { c.el.remove(); cursors.delete(pid); }
    }
  }, 5000);

  let lastCursorSent = 0;
  let cursorTimer = null;
  let pendingCursor = null;

  function sendCursor(cursor) {
    pendingCursor = cursor;
    const wait = CURSOR_INTERVAL_MS - (Date.now() - lastCursorSent);
    if (cursorTimer) return;
    cursorTimer = setTimeout(() => {
      cursorTimer = null;
      lastCursorSent = Date.now();
      if (live.connected) post({ type: 'cursor', cursor: pendingCursor });
    }, Math.max(0, wait));
  }

  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const vb = canvas.viewbox();
    sendCursor({ x: vb.x + (e.clientX - rect.left) / vb.scale, y: vb.y + (e.clientY - rect.top) / vb.scale });
  });
  container.addEventListener('mouseleave', () => sendCursor(null));

  // ---------- remote selections ----------

  function renderSelections() {
    overlays.remove({ type: 'live-selection' });
    for (const p of live.participants) {
      if (p.id === live.me.id || !p.selection?.length || p.status === 'viewing-old') continue;
      p.selection.forEach((sid, i) => {
        const el = registry.get(sid);
        if (!el || el.type === 'label') return;
        const box = el.waypoints ? waypointBox(el.waypoints) : { x: el.x, y: el.y, width: el.width, height: el.height };
        const html = document.createElement('div');
        html.className = 'live-selection';
        html.style.width = `${box.width + 8}px`;
        html.style.height = `${box.height + 8}px`;
        html.style.borderColor = p.color;
        if (i === 0) {
          const tag = document.createElement('span');
          tag.style.background = p.color;
          tag.textContent = p.name;
          html.appendChild(tag);
        }
        // overlay positions are relative to the element's bounding box
        overlays.add(sid, 'live-selection', { position: { top: -4, left: -4 }, html, scale: true });
      });
    }
  }

  function waypointBox(points) {
    const xs = points.map((pt) => pt.x);
    const ys = points.map((pt) => pt.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }

  let selectionTimer = null;
  modeler.on('selection.changed', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => { if (live.connected) sendPresence(); }, 150);
  });
  modeler.on('import.done', renderSelections);
  let resizeTimer = null;
  modeler.on('elements.changed', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderSelections, 100);
  });
  document.addEventListener('visibilitychange', () => { if (live.connected) sendPresence(); });
  // leave the board right away instead of when the browser eventually drops the connection
  window.addEventListener('pagehide', () => { source?.close(); live.connected = false; });
  window.addEventListener('pageshow', (e) => { if (e.persisted) connect(); });

  // ---------- public API ----------

  /** Shares a new version of the diagram; resolves to the new revision, or null if not shared. */
  live.publishDoc = async (xml) => {
    const { ok, data } = await post({ type: 'doc', xml });
    if (ok && data.rev) live.rev = data.rev;
    return ok ? data.rev : null;
  };
  live.setViewing = (version) => {
    viewing = version || null;
    if (live.connected) sendPresence();
  };
  live.othersCount = () => live.participants.filter((p) => p.id !== live.me.id).length;

  connect();
  return live;
}

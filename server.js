'use strict';

// Zero-dependency BPMN editor server.
//
// Storage layout (plain files, usable without this server):
//   <DATA_DIR>/<project-id>/<project-id>.bpmn      latest version
//   <DATA_DIR>/<project-id>/project.json           { name, createdAt }
//   <DATA_DIR>/<project-id>/history/<version>.bpmn every saved version
//   <DATA_DIR>/<project-id>/history/log.jsonl      one line per save: who / when / note

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const chatProvider = require('./providers/claude-code');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(
  (process.env.BPMN_DIR || path.join(os.homedir(), 'workspace', 'bpmn-diagrams')).replace(/^~(?=$|\/)/, os.homedir())
);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 20 * 1024 * 1024;
const MAX_CHAT_BODY = 60 * 1024 * 1024; // attachments arrive base64-encoded
const CHAT_ENABLED = process.env.CHAT !== 'off';
const CHAT_DIR = path.join(os.tmpdir(), 'bpmn-chat');
const CHAT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const CHAT_SYSTEM_PROMPT = `You are a BPMN 2.0 modeling assistant embedded in a web-based bpmn.io editor.
The diagram the user is editing is ./diagram.bpmn. It is rewritten from the editor's current (possibly unsaved) state before every message, so always read it fresh.
Files the user attached are in ./attachments/.

When the user asks for changes, edit ./diagram.bpmn in place:
- Keep it valid BPMN 2.0 XML that bpmn-js can import.
- Every element you add needs diagram interchange inside the existing bpmndi:BPMNPlane: a bpmndi:BPMNShape with dc:Bounds for flow nodes, pools, lanes and data objects, and a bpmndi:BPMNEdge with di:waypoint elements for flows. Typical sizes: task 100x80, event 36x36, gateway 50x50.
- Lay out left to right without overlaps, keep elements inside their pool/lane and resize pools/lanes when needed.
- Preserve existing IDs, names, colors and positions unless the request requires changing them.
- Use readable unique IDs, e.g. Activity_ReviewOrder.
If the user only asks a question, do not modify the file.
Reply concisely in plain text: what you changed, or the answer. Never paste the XML into the reply.`;

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

// ---------- storage ----------

const projectDir = (id) => path.join(DATA_DIR, id);
const latestFile = (id) => path.join(projectDir(id), `${id}.bpmn`);
const historyDir = (id) => path.join(projectDir(id), 'history');

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function writeAtomic(file, content) {
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, file);
}

function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'diagram';
}

async function readMeta(id) {
  try {
    return JSON.parse(await fsp.readFile(path.join(projectDir(id), 'project.json'), 'utf8'));
  } catch {
    return { name: id };
  }
}

async function listVersions(id) {
  let files = [];
  try { files = await fsp.readdir(historyDir(id)); } catch { return []; }
  const log = new Map();
  try {
    const lines = (await fsp.readFile(path.join(historyDir(id), 'log.jsonl'), 'utf8')).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); log.set(e.version, e); } catch { /* skip corrupt line */ }
    }
  } catch { /* no log yet */ }
  return files
    .filter((f) => f.endsWith('.bpmn'))
    .map((f) => f.slice(0, -5))
    .filter((v) => VERSION_RE.test(v))
    .sort()
    .reverse()
    .map((version) => ({ version, ...log.get(version) }));
}

async function currentVersion(id) {
  const versions = await listVersions(id);
  return versions.length ? versions[0].version : null;
}

function newVersionName(existing) {
  const base = new Date().toISOString().replace(/[:.]/g, '-');
  let name = base, n = 1;
  while (existing.has(name)) name = `${base}-${n++}`;
  return name;
}

async function saveVersion(id, xml, { author, note }) {
  await fsp.mkdir(historyDir(id), { recursive: true });
  const existing = new Set((await listVersions(id)).map((v) => v.version));
  const version = newVersionName(existing);
  const at = new Date().toISOString();
  await writeAtomic(path.join(historyDir(id), `${version}.bpmn`), xml);
  await writeAtomic(latestFile(id), xml);
  await fsp.appendFile(
    path.join(historyDir(id), 'log.jsonl'),
    JSON.stringify({ version, at, author: author || null, note: note || null, size: Buffer.byteLength(xml) }) + '\n'
  );
  return { version, at };
}

async function listProjects() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const entries = await fsp.readdir(DATA_DIR, { withFileTypes: true });
  const projects = [];
  for (const e of entries) {
    if (!e.isDirectory() || !ID_RE.test(e.name)) continue;
    if (!(await exists(latestFile(e.name)))) continue;
    const meta = await readMeta(e.name);
    const versions = await listVersions(e.name);
    const stat = await fsp.stat(latestFile(e.name));
    projects.push({
      id: e.name,
      name: meta.name || e.name,
      createdAt: meta.createdAt || null,
      updatedAt: versions[0]?.at || stat.mtime.toISOString(),
      updatedBy: versions[0]?.author || null,
      versionCount: versions.length
    });
  }
  return projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function createProject(name, xml, author) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const base = slugify(name);
  let id = base, n = 2;
  while (await exists(projectDir(id))) id = `${base}-${n++}`;
  await fsp.mkdir(historyDir(id), { recursive: true });
  await writeAtomic(path.join(projectDir(id), 'project.json'),
    JSON.stringify({ name: name || id, createdAt: new Date().toISOString() }, null, 2));
  await saveVersion(id, xml || EMPTY_DIAGRAM, { author, note: 'Created' });
  return id;
}

// ---------- chat ----------
//
// Each chat has a temp working directory (<tmp>/bpmn-chat/<chatId>/) holding diagram.bpmn,
// attachments/ and session.json (the provider's session id, to continue the conversation).

const busyChats = new Set();

function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '').slice(0, 120);
  return base || 'file';
}

async function saveAttachments(dir, attachments) {
  await fsp.mkdir(dir, { recursive: true });
  const saved = [];
  for (const a of attachments) {
    if (!a || typeof a.data !== 'string') continue;
    let name = safeFileName(a.name);
    const ext = path.extname(name);
    for (let n = 2; await exists(path.join(dir, name)); n++) name = `${path.basename(name, ext)}-${n}${ext}`;
    await fsp.writeFile(path.join(dir, name), Buffer.from(a.data, 'base64'));
    saved.push(`attachments/${name}`);
  }
  return saved;
}

async function chat(projectId, body) {
  const message = String(body.message || '').trim();
  if (!message) throw Object.assign(new Error('Message is empty'), { status: 400 });
  if (!looksLikeBpmn(body.xml)) throw Object.assign(new Error('Current diagram is missing'), { status: 400 });

  const chatId = CHAT_ID_RE.test(body.chatId || '') ? body.chatId : crypto.randomUUID();
  if (busyChats.has(chatId)) throw Object.assign(new Error('Claude is still working on the previous message'), { status: 409 });
  busyChats.add(chatId);
  try {
    const dir = path.join(CHAT_DIR, chatId);
    await fsp.mkdir(dir, { recursive: true });
    const sessionFile = path.join(dir, 'session.json');
    let session = {};
    try { session = JSON.parse(await fsp.readFile(sessionFile, 'utf8')); } catch { /* new chat */ }
    if (session.projectId && session.projectId !== projectId) throw Object.assign(new Error('Chat belongs to another project'), { status: 400 });

    const diagramFile = path.join(dir, 'diagram.bpmn');
    await fsp.writeFile(diagramFile, body.xml);
    const attached = await saveAttachments(path.join(dir, 'attachments'), Array.isArray(body.attachments) ? body.attachments : []);

    const prompt = attached.length ? `${message}\n\nNewly attached files:\n${attached.map((f) => `- ./${f}`).join('\n')}` : message;
    const result = await chatProvider.run({ cwd: dir, prompt, systemPrompt: CHAT_SYSTEM_PROMPT, sessionId: session.sessionId || null });
    await writeAtomic(sessionFile, JSON.stringify({ projectId, sessionId: result.sessionId }));

    const after = await fsp.readFile(diagramFile, 'utf8');
    let xml = null;
    let reply = result.reply;
    if (after !== body.xml) {
      if (looksLikeBpmn(after)) xml = after;
      else reply += '\n\n(The diagram file Claude produced is not valid BPMN, so it was not applied.)';
    }
    return { chatId, reply, xml, costUsd: result.costUsd, provider: chatProvider.name };
  } finally {
    busyChats.delete(chatId);
  }
}

// ---------- http helpers ----------

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req, maxBody = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBody) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function looksLikeBpmn(xml) {
  return typeof xml === 'string' && /<([\w-]+:)?definitions[\s>]/.test(xml);
}

async function serveStatic(res, file) {
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch {
    send(res, 404, 'Not found');
  }
}

// ---------- routes ----------

async function handleApi(req, res, parts, url) {
  // parts: ['api', 'projects', id?, sub?, subId?]
  const [, resource, id, sub, subId] = parts;
  if (resource !== 'projects') return send(res, 404, { error: 'Not found' });

  if (!id) {
    if (req.method === 'GET') return send(res, 200, await listProjects());
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (body.xml && !looksLikeBpmn(body.xml)) return send(res, 400, { error: 'Not a BPMN file' });
      const newId = await createProject(String(body.name || 'Untitled diagram').trim().slice(0, 200), body.xml, body.author);
      return send(res, 201, { id: newId });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (!ID_RE.test(id) || !(await exists(latestFile(id)))) return send(res, 404, { error: 'Project not found' });

  if (!sub) {
    if (req.method === 'GET') {
      const [meta, xml, version] = await Promise.all([readMeta(id), fsp.readFile(latestFile(id), 'utf8'), currentVersion(id)]);
      return send(res, 200, { id, name: meta.name || id, version, xml });
    }
    if (req.method === 'PUT') {
      const body = await readJson(req);
      if (!looksLikeBpmn(body.xml)) return send(res, 400, { error: 'Not a BPMN diagram' });
      const latest = await currentVersion(id);
      if (!body.force && body.baseVersion !== latest) {
        const versions = await listVersions(id);
        return send(res, 409, { error: 'conflict', latest: versions[0] || null });
      }
      return send(res, 200, await saveVersion(id, body.xml, { author: body.author, note: body.note }));
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const meta = await readMeta(id);
      if (body.name) meta.name = String(body.name).trim().slice(0, 200);
      await writeAtomic(path.join(projectDir(id), 'project.json'), JSON.stringify(meta, null, 2));
      return send(res, 200, { id, name: meta.name });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (sub === 'chat' && req.method === 'POST') {
    if (!CHAT_ENABLED) return send(res, 403, { error: 'Chat is disabled on this server' });
    const body = await readJson(req, MAX_CHAT_BODY);
    try {
      return send(res, 200, await chat(id, body));
    } catch (err) {
      return send(res, err.status || 502, { error: err.message });
    }
  }

  if (sub === 'history' && req.method === 'GET') {
    if (!subId) return send(res, 200, await listVersions(id));
    if (!VERSION_RE.test(subId)) return send(res, 400, { error: 'Bad version' });
    try {
      const xml = await fsp.readFile(path.join(historyDir(id), `${subId}.bpmn`), 'utf8');
      return send(res, 200, { version: subId, xml });
    } catch {
      return send(res, 404, { error: 'Version not found' });
    }
  }

  if (sub === 'download' && req.method === 'GET') {
    const v = url.searchParams.get('version');
    let file = latestFile(id);
    if (v) {
      if (!VERSION_RE.test(v)) return send(res, 400, { error: 'Bad version' });
      file = path.join(historyDir(id), `${v}.bpmn`);
    }
    try {
      const data = await fsp.readFile(file);
      return send(res, 200, data, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${id}${v ? '-' + v : ''}.bpmn"`
      });
    } catch {
      return send(res, 404, { error: 'Not found' });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (parts[0] === 'api') return await handleApi(req, res, parts, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (parts.length === 0) return await serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
    if (parts[0] === 'p' && parts.length === 2) return await serveStatic(res, path.join(PUBLIC_DIR, 'editor.html'));
    const file = path.resolve(PUBLIC_DIR, ...parts);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
    return await serveStatic(res, file);
  } catch (err) {
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Internal error' });
    if (!err.status) console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BPMN editor running. Files are stored in ${DATA_DIR}`);
  console.log(`  Local:   http://localhost:${PORT}/`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Network: http://${a.address}:${PORT}/`);
    }
  }
});

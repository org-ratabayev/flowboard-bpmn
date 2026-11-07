// Starts the BPMN server as a child process for black-box HTTP tests.
//
// Every server gets its own free port, storage folder and temp folder (chat working
// directories live there), and uses test/fixtures/fake-claude.mjs instead of the real
// Claude Code CLI. TEST_SERVER_CMD overrides the command, so the same tests can run
// against another implementation of the server.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FAKE_CLAUDE = path.join(ROOT, 'test', 'fixtures', 'fake-claude.mjs');
export const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const srv = net.createServer().listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const { port } = srv.address();
  srv.close();
  await once(srv, 'close');
  return port;
}

export async function startServer(env = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bpmn-test-'));
  const dataDir = path.join(tmp, 'data');
  const port = await freePort();
  const [cmd, ...args] = (process.env.TEST_SERVER_CMD || 'node server.js').split(' ');
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      BPMN_DIR: dataDir,
      TMPDIR: tmp,
      CHAT: 'on',
      CLAUDE_BIN: FAKE_CLAUDE,
      CLAUDE_MODEL: '',
      CHAT_TIMEOUT_MS: '10000',
      ...env
    }
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup:\n${output}`);
    try {
      await fetch(`${base}/licenses`);
      break;
    } catch {
      if (i > 200) throw new Error(`Server did not start:\n${output}`);
      await sleep(25);
    }
  }

  return {
    base,
    dataDir,
    chatDir: path.join(tmp, 'bpmn-chat'),
    output: () => output,
    request: (method, urlPath, body) => request(base, method, urlPath, body),
    async stop() {
      if (child.exitCode === null) {
        child.kill();
        await once(child, 'exit');
      }
      await fs.rm(tmp, { recursive: true, force: true });
    }
  };
}

/** JSON request helper: returns { status, headers, body } with body parsed when it is JSON. */
export async function request(base, method, urlPath, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(base + urlPath, init);
  const text = await res.text();
  const isJson = (res.headers.get('content-type') || '').startsWith('application/json');
  return { status: res.status, headers: res.headers, body: isJson ? JSON.parse(text) : text };
}

/** A small valid BPMN diagram; `label` makes each version distinguishable. */
export function diagram(label = 'Task') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Activity_1" name="${label}" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="160" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/**
 * Opens the live event stream (SSE) of a project as one browser tab.
 * `next(event, match)` resolves with the first not-yet-consumed event of that name
 * whose data satisfies `match`.
 */
export async function openLive(base, projectId, clientId, name) {
  const controller = new AbortController();
  const query = new URLSearchParams({ client: clientId });
  if (name) query.set('name', name);
  const res = await fetch(`${base}/api/projects/${projectId}/live?${query}`, { signal: controller.signal });
  if (res.status !== 200) throw new Error(`live stream failed with ${res.status}`);

  const queue = [];
  const waiters = [];
  const deliver = (event) => {
    const i = waiters.findIndex((w) => w.event === event.event && w.match(event.data));
    if (i === -1) return queue.push(event);
    const [w] = waiters.splice(i, 1);
    clearTimeout(w.timer);
    w.resolve(event.data);
  };

  (async () => {
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (event && data !== undefined) deliver({ event, data: JSON.parse(data) });
        }
      }
    } catch { /* aborted */ }
  })();

  return {
    next(event, match = () => true, timeoutMs = 3000) {
      const i = queue.findIndex((e) => e.event === event && match(e.data));
      if (i !== -1) return Promise.resolve(queue.splice(i, 1)[0].data);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.splice(waiters.findIndex((w) => w.resolve === resolve), 1);
          reject(new Error(`No "${event}" event within ${timeoutMs} ms`));
        }, timeoutMs);
        waiters.push({ event, match, resolve, timer });
      });
    },
    post: (body) => request(base, 'POST', `/api/projects/${projectId}/live`, { client: clientId, ...body }),
    close: () => controller.abort()
  };
}

export { sleep };

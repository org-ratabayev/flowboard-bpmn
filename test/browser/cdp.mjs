// A minimal Chrome DevTools Protocol client: starts headless Chrome, opens one page and runs
// commands in it. Uses Node's built-in WebSocket, so it needs no dependencies.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'
];

/** Path of an installed Chrome or Chromium, or null. An explicit CHROME_BIN is the only candidate. */
export function findChrome() {
  if (process.env.CHROME_BIN) return fs.existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : null;
  for (const candidate of CANDIDATES) {
    if (!candidate) continue;
    if (candidate.includes('/')) { if (fs.existsSync(candidate)) return candidate; continue; }
    const found = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return null;
}

export async function launch(bin) {
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'chrome-test-'));
  const child = spawn(bin, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1400,900', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let err = '';
    child.stderr.on('data', (d) => {
      err += d;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (match) resolve(match[1]);
    });
    child.once('exit', (code) => reject(new Error(`Chrome exited with ${code}: ${err}`)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message} ${data.error.data || ''}`));
      else resolve(data.result);
    } else if (data.method) {
      for (const l of listeners) l(data);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Page.setBypassCSP', { enabled: true });

  const errors = [];
  listeners.push((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    if (event.method === 'Page.javascriptDialogOpening') {
      dialogs.push(event.params.message);
      page('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  const dialogs = [];

  return {
    errors,
    /** Messages of confirm/alert dialogs, which are accepted automatically. */
    dialogs,
    send: page,
    async setCookie(cookie) { await page('Network.setCookie', cookie); },
    async goto(url) { await page('Page.navigate', { url }); },
    /** Evaluates an expression (awaiting promises) and returns its value. */
    async eval(expression) {
      const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(`In page: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
      return result.value;
    },
    /** Waits until the expression is truthy; returns its value. */
    async waitFor(expression, { timeoutMs = 15000, what = expression } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const value = await this.eval(expression).catch(() => undefined);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async close() {
      ws.close();
      child.kill();
      await new Promise((r) => child.once('exit', r));
      await fsp.rm(profile, { recursive: true, force: true });
    }
  };
}

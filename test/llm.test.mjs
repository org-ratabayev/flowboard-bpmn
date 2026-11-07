// AI providers: the catalog a user sees, and personal keys kept encrypted per browser.
// A local stand-in answers for the provider, so no real key or network is needed.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { request, startServer } from './helpers/server.mjs';

const GOOD_KEY = 'sk-ant-good-key-for-tests-0001';
const ECHO_KEY = 'sk-ant-echo-key-for-tests-0002';
const POSTGRES = process.env.TEST_STORAGE === 'postgres';

// the provider: accepts GOOD_KEY, rejects others, and fails loudly (echoing the key) for ECHO_KEY
const seen = [];
const provider = http.createServer((req, res) => {
  const key = req.headers['x-api-key'];
  seen.push({ url: req.url, key });
  if (key === ECHO_KEY) {
    res.writeHead(500, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: `internal error for key ${key}` } }));
  }
  if (key !== GOOD_KEY && !String(key).startsWith('sk-ant-good-')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'invalid x-api-key' } }));
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ data: [{ id: 'claude-test' }] }));
});

let server;
let providerUrl;
before(async () => {
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  providerUrl = `http://127.0.0.1:${provider.address().port}`;
  server = await startServer({
    LLM_PROVIDERS: JSON.stringify([
      { id: 'anthropic', label: 'Anthropic', type: 'anthropic', baseUrl: providerUrl, models: ['claude-test'], credentials: { from: 'user-key' } }
    ])
  });
});
after(async () => {
  await server?.stop();
  provider.close();
});

/** A browser: the session cookie plus whatever cookies the server sets later (the keyring). */
async function browser(name) {
  const jar = new Map();
  const login = await fetch(`${server.base}/auth/dev/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.base }, body: JSON.stringify({ name })
  });
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (/Max-Age=0/.test(c)) jar.delete(k); else jar.set(k, v);
    }
  };
  keep(login);
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    jar,
    async call(method, urlPath, body) {
      const res = await request(server.base, method, urlPath, body, { cookie: cookie() });
      keep({ headers: res.headers });
      return res;
    }
  };
}

const anthropicOf = (res) => res.body.providers.find((p) => p.id === 'anthropic');

describe('personal AI keys', () => {
  it('lists the configured providers without a key at first', async () => {
    const ann = await browser('Ann');
    const res = await ann.call('GET', '/api/llm/providers');
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, 'personal');
    assert.deepEqual(res.body.providers.map((p) => p.id), ['anthropic']);
    assert.deepEqual(anthropicOf(res), {
      id: 'anthropic', label: 'Anthropic', type: 'anthropic', models: ['claude-test'], defaultModel: 'claude-test', credentials: 'user-key',
      ready: false, reason: 'Add your own key for this provider in Settings', key: null
    });
  });

  it('checks a key with the provider and refuses one it does not accept', async () => {
    const ann = await browser('Ann');
    const res = await ann.call('PUT', '/api/llm/keys/anthropic', { key: 'sk-ant-wrong-key-0000' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Anthropic did not accept this key');
    assert.equal(seen.at(-1).key, 'sk-ant-wrong-key-0000');
    assert.equal(ann.jar.has('flowboard_keyring'), false);
    assert.equal(anthropicOf(await ann.call('GET', '/api/llm/providers')).key, null);

    for (const key of ['', 'has spaces in it', 'x'.repeat(501)]) {
      assert.equal((await ann.call('PUT', '/api/llm/keys/anthropic', { key })).status, 400);
    }
  });

  it('never echoes a key back, even in provider errors', async () => {
    const ann = await browser('Ann');
    const res = await ann.call('PUT', '/api/llm/keys/anthropic', { key: ECHO_KEY });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /Could not reach Anthropic to check the key: .*\[redacted\]/);
    assert.ok(!JSON.stringify(res.body).includes(ECHO_KEY));
    assert.ok(!server.output().includes(ECHO_KEY));
  });

  it('saves a key for this browser only, behind a strict HttpOnly cookie', async () => {
    const ann = await browser('Ann');
    const saved = await ann.call('PUT', '/api/llm/keys/anthropic', { key: GOOD_KEY });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.hint, 'sk-ant-…0001');
    assert.ok(!JSON.stringify(saved.body).includes(GOOD_KEY));
    const [cookie] = saved.headers.getSetCookie();
    assert.match(cookie, /^flowboard_keyring=[0-9a-f]{32}\.[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=31536000$/);

    const listed = anthropicOf(await ann.call('GET', '/api/llm/providers'));
    assert.equal(listed.ready, true);
    assert.equal(listed.key.hint, 'sk-ant-…0001');
    assert.equal(listed.reason, undefined);

    // the same user in another browser, and another user with this browser's keyring, see no key
    const annElsewhere = await browser('Ann');
    assert.equal(anthropicOf(await annElsewhere.call('GET', '/api/llm/providers')).key, null);
    const bob = await browser('Bob');
    bob.jar.set('flowboard_keyring', ann.jar.get('flowboard_keyring'));
    assert.equal(anthropicOf(await bob.call('GET', '/api/llm/providers')).key, null);

    // a second save from the same browser replaces the key and keeps the cookie
    const again = await ann.call('PUT', '/api/llm/keys/anthropic', { key: 'sk-ant-good-replacement-9999' });
    assert.equal(again.headers.getSetCookie().length, 0);
    assert.equal(anthropicOf(await ann.call('GET', '/api/llm/providers')).key.hint, 'sk-ant-…9999');
  });

  it('removes a key', async () => {
    const ann = await browser('Ann');
    await ann.call('PUT', '/api/llm/keys/anthropic', { key: GOOD_KEY });
    assert.equal((await ann.call('DELETE', '/api/llm/keys/anthropic')).status, 204);
    assert.equal(anthropicOf(await ann.call('GET', '/api/llm/providers')).key, null);
    assert.equal((await ann.call('DELETE', '/api/llm/keys/anthropic')).status, 404);
    assert.equal((await ann.call('PUT', '/api/llm/keys/elsewhere', { key: GOOD_KEY })).status, 404);
  });

  it('forgets the keys of a browser when its user signs out', async () => {
    const ann = await browser('Ann');
    await ann.call('PUT', '/api/llm/keys/anthropic', { key: GOOD_KEY });
    const keyring = ann.jar.get('flowboard_keyring');
    const out = await ann.call('POST', '/auth/logout');
    assert.ok(out.headers.getSetCookie().some((c) => /^flowboard_keyring=; .*Max-Age=0/.test(c)));

    const back = await browser('Ann');
    back.jar.set('flowboard_keyring', keyring); // even if the old cookie were kept
    assert.equal(anthropicOf(await back.call('GET', '/api/llm/providers')).key, null);
  });

  it('keeps keys away from access tokens', async () => {
    const ann = await browser('Ann');
    await ann.call('PUT', '/api/llm/keys/anthropic', { key: GOOD_KEY });
    const { token } = (await ann.call('POST', '/api/tokens', { name: 'Script', expiresInDays: 1 })).body;
    const withToken = (method, urlPath, body) =>
      request(server.base, method, urlPath, body, { headers: { Authorization: `Bearer ${token}`, Origin: null } });

    const listed = await withToken('GET', '/api/llm/providers');
    assert.equal(listed.status, 200);
    assert.equal(anthropicOf(listed).key, null);
    assert.equal((await withToken('PUT', '/api/llm/keys/anthropic', { key: GOOD_KEY })).status, 403);
    assert.equal((await withToken('DELETE', '/api/llm/keys/anthropic')).status, 403);
  });

  it('needs a session', async () => {
    assert.equal((await server.anonymous('GET', '/api/llm/providers')).status, 401);
  });
});

describe('server secret', () => {
  it(POSTGRES ? 'must be configured with Postgres' : 'is generated once into the data folder with SQLite', async () => {
    if (POSTGRES) {
      await assert.rejects(startServer({ APP_SECRET: '' }), /APP_SECRET is required with Postgres/);
      return;
    }
    const file = path.join(server.dataDir, 'app-secret');
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.match(server.output(), /APP_SECRET is not set/);
  });

  it('is not needed when no provider takes own keys', async () => {
    const managed = await startServer({ LLM_MODE: 'managed', APP_SECRET: '' });
    try {
      const res = await managed.request('GET', '/api/llm/providers');
      assert.deepEqual(res.body, { mode: 'managed', providers: [] });
      await assert.rejects(fs.stat(path.join(managed.dataDir, 'app-secret')));
    } finally {
      await managed.stop();
    }
  });
});

describe('managed AI providers', () => {
  const PROXY_SECRET = 'proxy-secret-for-tests-0123456789';
  let managed;
  before(async () => {
    managed = await startServer({
      AUTH: 'trusted-headers',
      AUTH_PROXY_SECRET: PROXY_SECRET,
      AUTH_TOKEN_HEADER: 'X-Forwarded-Access-Token',
      LLM_MODE: 'managed',
      TEAM_LLM_KEY: 'server-held-secret-key-0000',
      LLM_PROVIDERS: JSON.stringify([
        { id: 'team', label: 'Team key', type: 'anthropic', baseUrl: providerUrl, credentials: { from: 'server', secretEnv: 'TEAM_LLM_KEY' } },
        { id: 'unset', label: 'Not set up', type: 'anthropic', credentials: { from: 'server', secretEnv: 'MISSING_LLM_KEY' } },
        { id: 'gateway', label: 'Gateway', type: 'openai-compatible', baseUrl: `${providerUrl}/v1`, credentials: { from: 'identity' }, userIdHeader: 'x-user-id' }
      ])
    });
  });
  after(() => managed?.stop());

  const as = (extra = {}) => managed.anonymous('GET', '/api/llm/providers', undefined, {
    headers: { 'x-proxy-secret': PROXY_SECRET, 'x-forwarded-user': 'ann', ...extra }
  });

  it('shows which providers are ready, without their secrets', async () => {
    const res = await as({ 'x-forwarded-access-token': 'user-access-token' });
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, 'managed');
    assert.deepEqual(res.body.providers.map((p) => [p.id, p.credentials, p.ready]), [
      ['team', 'server', true], ['unset', 'server', false], ['gateway', 'identity', true]
    ]);
    assert.equal(res.body.providers[1].reason, 'Not configured on the server');
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('server-held-secret') && !text.includes('user-access-token') && !text.includes(providerUrl));
  });

  it('needs the identity token from the proxy for identity providers', async () => {
    const gateway = (await as()).body.providers.find((p) => p.id === 'gateway');
    assert.equal(gateway.ready, false);
  });

  it('does not take own keys', async () => {
    const res = await managed.anonymous('PUT', '/api/llm/keys/team', { key: GOOD_KEY }, {
      headers: { 'x-proxy-secret': PROXY_SECRET, 'x-forwarded-user': 'ann' }
    });
    assert.equal(res.status, 404);
  });
});

describe('page security headers', () => {
  it('serve pages with a content security policy and API responses without', async () => {
    const cookie = await server.signIn('Tester');
    for (const page of ['/', '/settings', '/login.html']) {
      const res = await fetch(server.base + page, { headers: { Cookie: cookie } });
      assert.equal(res.status, 200, page);
      assert.match(res.headers.get('content-security-policy'), /script-src 'self';/);
      assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('referrer-policy'), 'same-origin');
    }
    const api = await server.request('GET', '/api/me');
    assert.equal(api.headers.get('content-security-policy'), null);
  });
});

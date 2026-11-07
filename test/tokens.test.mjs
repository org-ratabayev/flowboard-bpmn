// Personal access tokens: managed in a browser session, used as Bearer tokens by API clients.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagram, startServer } from './helpers/server.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server.stop());

/** An API client: Bearer token, no cookie, no Origin header. */
const withToken = (token) => (method, urlPath, body) =>
  server.anonymous(method, urlPath, body, { headers: { Authorization: `Bearer ${token}`, Origin: null } });

describe('access tokens', () => {
  it('are created once, listed without their value, and work as Bearer tokens', async () => {
    const ann = server.as('Ann');
    const created = await ann('POST', '/api/tokens', { name: 'Laptop MCP client', expiresInDays: 90 });
    assert.equal(created.status, 201);
    const { token, ...info } = created.body;
    assert.match(token, /^fb_pat_[\w-]{43}$/);
    assert.equal(info.name, 'Laptop MCP client');
    assert.equal(info.hint, `${token.slice(0, 11)}…`);
    assert.equal(info.lastUsedAt, null);
    const days = (Date.parse(info.expiresAt) - Date.parse(info.createdAt)) / 864e5;
    assert.ok(Math.abs(days - 90) < 0.01);

    const list = await ann('GET', '/api/tokens');
    assert.deepEqual(list.body, [info]);
    assert.ok(!JSON.stringify(list.body).includes(token.slice(11)));

    const api = withToken(token);
    const me = await api('GET', '/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.name, 'Ann');
    assert.equal(me.body.canLogout, false);

    // writes without an Origin header, and the token's owner is the author
    const project = await api('POST', '/api/projects', { name: 'From a script', xml: diagram('Scripted') });
    assert.equal(project.status, 201);
    const history = await api('GET', `/api/projects/${project.body.id}/history`);
    assert.equal(history.body[0].author, 'Ann');

    const listed = (await ann('GET', '/api/tokens')).body[0];
    assert.ok(listed.lastUsedAt);
  });

  it('also open the live stream', async () => {
    const { token } = (await server.as('Ann')('POST', '/api/tokens', { name: 'Live', expiresInDays: null })).body;
    const id = (await withToken(token)('POST', '/api/projects', { name: 'Live via token' })).body.id;
    const controller = new AbortController();
    const res = await fetch(`${server.base}/api/projects/${id}/live?client=client-token-1`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    while (!text.includes('event: hello')) text += (await reader.read()).value;
    assert.match(text, /"name":"Ann"/);
    controller.abort();
  });

  it('are refused when unknown, malformed or revoked, even next to a valid session cookie', async () => {
    const cookie = await server.signIn('Ann');
    for (const token of ['fb_pat_' + 'x'.repeat(43), 'nonsense', '']) {
      const res = await server.anonymous('GET', '/api/projects', undefined, { cookie, headers: { Authorization: `Bearer ${token}` } });
      assert.equal(res.status, 401, token);
    }
    const created = (await server.as('Ann')('POST', '/api/tokens', { name: 'Short-lived', expiresInDays: 1 })).body;
    assert.equal((await withToken(created.token)('GET', '/api/projects')).status, 200);
    assert.equal((await server.as('Ann')('DELETE', `/api/tokens/${created.id}`)).status, 204);
    assert.equal((await withToken(created.token)('GET', '/api/projects')).status, 401);
    assert.ok(!(await server.as('Ann')('GET', '/api/tokens')).body.some((t) => t.id === created.id));
  });

  it('cannot manage tokens themselves', async () => {
    const { token, id } = (await server.as('Ann')('POST', '/api/tokens', { name: 'Script', expiresInDays: 30 })).body;
    const api = withToken(token);
    for (const [method, urlPath, body] of [['GET', '/api/tokens'], ['POST', '/api/tokens', { name: 'More' }], ['DELETE', `/api/tokens/${id}`]]) {
      const res = await api(method, urlPath, body);
      assert.equal(res.status, 403, `${method} ${urlPath}`);
      assert.match(res.body.error, /Manage access tokens in the app/);
    }
    assert.equal((await api('GET', '/api/projects')).status, 200);
  });

  it('belong to one user', async () => {
    const { id } = (await server.as('Ann')('POST', '/api/tokens', { name: "Ann's", expiresInDays: 30 })).body;
    assert.ok(!(await server.as('Bob')('GET', '/api/tokens')).body.some((t) => t.id === id));
    assert.equal((await server.as('Bob')('DELETE', `/api/tokens/${id}`)).status, 404);
    assert.ok((await server.as('Ann')('GET', '/api/tokens')).body.some((t) => t.id === id));
  });

  it('validate name and expiry', async () => {
    const ann = server.as('Ann');
    assert.equal((await ann('POST', '/api/tokens', { name: '  ', expiresInDays: 30 })).status, 400);
    for (const expiresInDays of [0, -1, 1.5, 3651, '30']) {
      assert.equal((await ann('POST', '/api/tokens', { name: 'Bad', expiresInDays })).status, 400, String(expiresInDays));
    }
    const noExpiry = await ann('POST', '/api/tokens', { name: 'Forever' });
    assert.equal(noExpiry.status, 201);
    assert.equal(noExpiry.body.expiresAt, null);
  });

  it('still need a session or a token for everything else', async () => {
    assert.equal((await server.anonymous('GET', '/api/tokens')).status, 401);
    const settings = await server.anonymous('GET', '/settings');
    assert.equal(settings.status, 302);
    assert.equal(settings.headers.get('location'), '/auth/login?returnTo=%2Fsettings');
    const page = await server.request('GET', '/settings');
    assert.equal(page.status, 200);
    assert.match(page.body, /Access tokens/);
  });
});

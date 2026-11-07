// Sign-in, sessions and request protection, from the outside.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';

describe('dev sign-in', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(() => server.stop());

  it('requires a session for the API and sends pages to the sign-in page', async () => {
    const api = await server.anonymous('GET', '/api/projects');
    assert.equal(api.status, 401);
    assert.deepEqual(api.body, { error: 'unauthorized', loginUrl: '/auth/login' });
    for (const [page, returnTo] of [['/', '%2F'], ['/p/order-flow?x=1', '%2Fp%2Forder-flow%3Fx%3D1']]) {
      const res = await server.anonymous('GET', page);
      assert.equal(res.status, 302, page);
      assert.equal(res.headers.get('location'), `/auth/login?returnTo=${returnTo}`);
    }
    assert.equal((await server.anonymous('GET', '/editor.html')).status, 401);
  });

  it('keeps the sign-in page, assets and license list public', async () => {
    const login = await server.anonymous('GET', '/auth/login');
    assert.equal(login.status, 200);
    assert.match(login.body, /Sign in/);
    const asset = login.body.match(/(?:src|href)="(\/assets\/[^"]+)"/)[1];
    assert.equal((await server.anonymous('GET', asset)).status, 200);
    assert.equal((await server.anonymous('GET', '/licenses')).status, 200);
  });

  it('signs in with a name and sets a protected session cookie', async () => {
    const res = await fetch(`${server.base}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: server.base },
      body: JSON.stringify({ name: '  Ann <b>Lee</b>  ' })
    });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /^flowboard_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
    const me = await server.anonymous('GET', '/api/me', undefined, { cookie: cookie.split(';')[0] });
    assert.equal(me.status, 200);
    assert.deepEqual({ ...me.body, id: undefined }, { id: undefined, name: 'Ann bLee/b', email: null, provider: 'dev', canLogout: true });
  });

  it('gives the same name the same user, whatever its case', async () => {
    const a = (await server.as('Dana')('GET', '/api/me')).body;
    const b = (await server.as('dana')('GET', '/api/me')).body;
    assert.equal(a.id, b.id);
    assert.equal(b.name, 'dana');
  });

  it('rejects empty names', async () => {
    const res = await server.anonymous('POST', '/auth/dev/login', { name: ' <> ' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Enter your name' });
  });

  it('ends the session on sign-out', async () => {
    const cookie = await server.signIn('Leaving');
    assert.equal((await server.anonymous('GET', '/api/me', undefined, { cookie })).status, 200);
    const out = await server.anonymous('POST', '/auth/logout', undefined, { cookie });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { redirect: '/auth/login' });
    assert.match(out.headers.get('set-cookie'), /^flowboard_session=; .*Max-Age=0/);
    assert.equal((await server.anonymous('GET', '/api/me', undefined, { cookie })).status, 401);
  });

  it('ignores unknown or forged session cookies', async () => {
    for (const cookie of ['flowboard_session=nope', 'flowboard_session=%E0%A4%A', 'other=1']) {
      assert.equal((await server.anonymous('GET', '/api/me', undefined, { cookie })).status, 401, cookie);
    }
  });

  it('refuses requests that change data from other sites or without an Origin', async () => {
    const cookie = await server.signIn('Tester');
    for (const Origin of ['https://evil.example', 'null', null]) {
      const res = await server.anonymous('POST', '/api/projects', { name: 'CSRF' }, { cookie, headers: { Origin } });
      assert.equal(res.status, 403, String(Origin));
      assert.deepEqual(res.body, { error: 'Cross-site request refused' });
    }
    const login = await server.anonymous('POST', '/auth/dev/login', { name: 'X' }, { headers: { Origin: 'https://evil.example' } });
    assert.equal(login.status, 403);
    // reading needs no Origin
    assert.equal((await server.anonymous('GET', '/api/projects', undefined, { cookie, headers: { Origin: null } })).status, 200);
    assert.ok(!(await server.request('GET', '/api/projects')).body.some((p) => p.name === 'CSRF'));
  });
});

describe('dev sign-in with a public origin', () => {
  let server;
  before(async () => { server = await startServer({ PUBLIC_ORIGIN: 'https://bpmn.example.com' }); });
  after(() => server.stop());

  it('marks the cookie Secure and checks Origin against the public origin', async () => {
    const own = await server.anonymous('POST', '/auth/dev/login', { name: 'Ann' }, { headers: { Origin: server.base } });
    assert.equal(own.status, 403);
    const res = await server.anonymous('POST', '/auth/dev/login', { name: 'Ann' }, { headers: { Origin: 'https://bpmn.example.com' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /; Secure$/);
  });
});

describe('trusted-headers sign-in', () => {
  const SECRET = 'proxy-secret-0123456789';
  const env = {
    AUTH: 'trusted-headers',
    AUTH_PROXY_SECRET: SECRET,
    AUTH_NAME_HEADER: 'X-Forwarded-Name',
    AUTH_EMAIL_HEADER: 'X-Forwarded-Email'
  };
  const proxied = (user, extra = {}) => ({
    headers: { 'x-proxy-secret': SECRET, 'x-forwarded-user': user, 'x-forwarded-name': 'Ann Lee', 'x-forwarded-email': 'ann@example.com', ...extra }
  });
  let server;
  before(async () => { server = await startServer(env); });
  after(() => server.stop());

  it('takes the identity from the proxy headers', async () => {
    const me = await server.anonymous('GET', '/api/me', undefined, proxied('ann'));
    assert.equal(me.status, 200);
    assert.deepEqual({ ...me.body, id: undefined }, { id: undefined, name: 'Ann Lee', email: 'ann@example.com', provider: 'trusted-headers', canLogout: false });
    const created = await server.anonymous('POST', '/api/projects', { name: 'Via proxy' }, proxied('ann'));
    assert.equal(created.status, 201);
    const history = await server.anonymous('GET', `/api/projects/${created.body.id}/history`, undefined, proxied('ann'));
    assert.equal(history.body[0].author, 'Ann Lee');
  });

  it('ignores identity headers without the right proxy secret', async () => {
    for (const secret of [undefined, 'wrong-secret-0123456789', '']) {
      const res = await server.anonymous('GET', '/api/me', undefined, proxied('ann', { 'x-proxy-secret': secret }));
      assert.equal(res.status, 401, String(secret));
    }
    assert.equal((await server.anonymous('GET', '/api/me', undefined, { headers: { 'x-proxy-secret': SECRET } })).status, 401);
  });

  it('has no sign-in page or dev sign-in of its own', async () => {
    assert.equal((await server.anonymous('GET', '/auth/login')).status, 401);
    assert.equal((await server.anonymous('POST', '/auth/dev/login', { name: 'X' })).status, 404);
  });

  it('can trust the proxy by address instead of a secret', async () => {
    const byAddress = await startServer({ AUTH: 'trusted-headers', AUTH_TRUSTED_PROXIES: '127.0.0.1, ::1' });
    const elsewhere = await startServer({ AUTH: 'trusted-headers', AUTH_TRUSTED_PROXIES: '10.0.0.0/8' });
    try {
      const ok = await byAddress.anonymous('GET', '/api/me', undefined, { headers: { 'x-forwarded-user': 'bob' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.name, 'bob');
      assert.equal((await elsewhere.anonymous('GET', '/api/me', undefined, { headers: { 'x-forwarded-user': 'bob' } })).status, 401);
    } finally {
      await Promise.all([byAddress.stop(), elsewhere.stop()]);
    }
  });

  it('refuses to start without a way to verify the proxy', async () => {
    await assert.rejects(startServer({ AUTH: 'trusted-headers' }), /needs a way to verify the proxy/);
    await assert.rejects(startServer({ AUTH: 'magic' }), /Invalid configuration[\s\S]*auth/);
  });
});

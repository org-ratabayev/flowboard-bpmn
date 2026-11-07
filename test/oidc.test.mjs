// OpenID Connect sign-in against a local mock provider (oauth2-mock-server).

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OAuth2Server } from 'oauth2-mock-server';
import { startServer } from './helpers/server.mjs';

let idp;
let nextUser = {};
before(async () => {
  idp = new OAuth2Server();
  await idp.issuer.keys.generate('RS256');
  await idp.start(0, '127.0.0.1');
  idp.service.on('beforeTokenSigning', (token) => Object.assign(token.payload, nextUser));
});
after(() => idp.stop());

const oidcEnv = (extra = {}) => ({
  AUTH: 'oidc',
  OIDC_ISSUER: idp.issuer.url,
  OIDC_CLIENT_ID: 'flowboard',
  OIDC_CLIENT_SECRET: 'client-secret',
  PUBLIC_ORIGIN: 'self',
  ...extra
});

/** Runs the browser side of a sign-in: app → provider → app callback. */
async function signIn(server, { returnTo = '/', user = { sub: 'u-ann', name: 'Ann Lee', email: 'ann@example.com' } } = {}) {
  nextUser = user;
  const start = await fetch(`${server.base}/auth/login?returnTo=${encodeURIComponent(returnTo)}`, { redirect: 'manual' });
  const stateCookie = start.headers.get('set-cookie')?.split(';')[0];
  const atProvider = await fetch(start.headers.get('location'), { redirect: 'manual' });
  const callbackUrl = atProvider.headers.get('location');
  const callback = await fetch(callbackUrl, { redirect: 'manual', headers: { Cookie: stateCookie } });
  const session = callback.headers.getSetCookie().find((c) => c.startsWith('flowboard_session='))?.split(';')[0];
  return { start, stateCookie, callbackUrl, callback, session };
}

describe('OIDC sign-in', () => {
  let server;
  before(async () => { server = await startServer(oidcEnv()); });
  after(() => server.stop());

  it('sends the user to the provider with PKCE, state and nonce', async () => {
    const start = await fetch(`${server.base}/auth/login?returnTo=%2Fp%2Fx`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const target = new URL(start.headers.get('location'));
    assert.equal(target.origin + target.pathname, `${idp.issuer.url}/authorize`);
    const q = Object.fromEntries(target.searchParams);
    assert.equal(q.response_type, 'code');
    assert.equal(q.client_id, 'flowboard');
    assert.equal(q.redirect_uri, `${server.base}/auth/callback`);
    assert.equal(q.scope, 'openid profile email');
    assert.equal(q.code_challenge_method, 'S256');
    assert.match(q.code_challenge, /^[\w-]{43}$/);
    assert.ok(q.state && q.nonce);
    assert.match(start.headers.get('set-cookie'), new RegExp(`^flowboard_oidc_state=${q.state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`));
  });

  it('signs in, returns to the page and keeps the provider identity', async () => {
    const { callback, session } = await signIn(server, { returnTo: '/p/order-flow' });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/p/order-flow');
    assert.ok(session);
    const me = await server.anonymous('GET', '/api/me', undefined, { cookie: session });
    assert.deepEqual({ ...me.body, id: undefined }, { id: undefined, name: 'Ann Lee', email: 'ann@example.com', provider: 'oidc', canLogout: true });

    const again = await signIn(server, { user: { sub: 'u-ann', name: 'Ann L.', email: 'ann@example.com' } });
    const meAgain = await server.anonymous('GET', '/api/me', undefined, { cookie: again.session });
    assert.equal(meAgain.body.id, me.body.id);
    assert.equal(meAgain.body.name, 'Ann L.');
  });

  it('never returns to another site', async () => {
    for (const returnTo of ['https://evil.example', '//evil.example', '/\\evil.example']) {
      const { callback } = await signIn(server, { returnTo });
      assert.equal(callback.headers.get('location'), '/', returnTo);
    }
  });

  it('refuses callbacks without the browser state cookie, with a wrong state, or used twice', async () => {
    const first = await signIn(server);
    assert.equal(first.callback.status, 302);
    const replay = await fetch(first.callbackUrl, { redirect: 'manual', headers: { Cookie: first.stateCookie } });
    assert.equal(replay.status, 400);
    assert.match(await replay.text(), /expired, was already used/);

    nextUser = { sub: 'u-x' };
    const start = await fetch(`${server.base}/auth/login`, { redirect: 'manual' });
    const callbackUrl = (await fetch(start.headers.get('location'), { redirect: 'manual' })).headers.get('location');
    assert.equal((await fetch(callbackUrl, { redirect: 'manual' })).status, 400); // no cookie: started in another browser
    const tampered = callbackUrl.replace(/state=[^&]+/, 'state=forged');
    assert.equal((await fetch(tampered, { redirect: 'manual', headers: { Cookie: 'flowboard_oidc_state=forged' } })).status, 400);
  });

  it('shows the provider refusing sign-in', async () => {
    const start = await fetch(`${server.base}/auth/login`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const res = await fetch(`${server.base}/auth/callback?state=${state}&error=access_denied&error_description=User%20cancelled`, {
      redirect: 'manual', headers: { Cookie: start.headers.get('set-cookie').split(';')[0] }
    });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /User cancelled/);
  });

  it('signs out to a page that does not sign the user straight back in', async () => {
    const { session } = await signIn(server);
    const out = await server.anonymous('POST', '/auth/logout', undefined, { cookie: session });
    assert.deepEqual(out.body, { redirect: '/auth/signed-out' });
    assert.equal((await server.anonymous('GET', '/api/me', undefined, { cookie: session })).status, 401);
    const page = await server.anonymous('GET', '/auth/signed-out');
    assert.equal(page.status, 200);
    assert.match(page.body, /You are signed out/);
  });

  it('has no dev sign-in', async () => {
    assert.equal((await server.anonymous('POST', '/auth/dev/login', { name: 'Mallory' })).status, 404);
  });
});

describe('OIDC sign-in restricted to email domains', () => {
  let server;
  before(async () => { server = await startServer(oidcEnv({ OIDC_ALLOWED_DOMAINS: 'example.com' })); });
  after(() => server.stop());

  it('lets in verified addresses of allowed domains only', async () => {
    const ok = await signIn(server, { user: { sub: 'a', name: 'A', email: 'a@Example.com', email_verified: true } });
    assert.equal(ok.callback.status, 302);
    for (const user of [
      { sub: 'b', name: 'B', email: 'b@other.org' },
      { sub: 'c', name: 'C', email: 'c@example.com', email_verified: false },
      { sub: 'd', name: 'D', email: 'd@notexample.com' }
    ]) {
      const refused = await signIn(server, { user });
      assert.equal(refused.callback.status, 403, user.email);
      assert.equal(refused.session, undefined);
    }
  });
});

describe('OIDC configuration', () => {
  it('starts while the provider is unreachable and explains it on sign-in', async () => {
    const server = await startServer(oidcEnv({ OIDC_ISSUER: 'http://127.0.0.1:9' }));
    try {
      const res = await server.anonymous('GET', '/auth/login');
      assert.equal(res.status, 502);
      assert.match(res.body, /cannot be reached/);
    } finally {
      await server.stop();
    }
  });

  it('needs an issuer, a client id and the public origin', async () => {
    await assert.rejects(startServer({ AUTH: 'oidc', OIDC_ISSUER: idp.issuer.url, OIDC_CLIENT_ID: 'x' }), /PUBLIC_ORIGIN/);
    await assert.rejects(startServer({ AUTH: 'oidc', PUBLIC_ORIGIN: 'self' }), /OIDC_ISSUER/);
  });
});

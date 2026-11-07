// Share links, invitations by email and the access log.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagram, startServer } from './helpers/server.mjs';

describe('share links', () => {
  let server;
  let id;
  const owner = () => server.as('Olivia');
  const join = (user, token) => server.as(user)('POST', '/api/share/join', { token });
  const roleOf = async (user) => {
    const res = await server.as(user)('GET', `/api/projects/${id}`);
    return res.status === 404 ? 'none' : res.body.role;
  };
  const createLink = async (role, expiresInDays = 30) =>
    (await owner()('POST', `/api/projects/${id}/access/links`, { role, expiresInDays })).body;

  before(async () => {
    server = await startServer();
    id = (await server.as('Olivia')('POST', '/api/projects', { name: 'Linked', xml: diagram() })).body.id;
  });
  after(() => server.stop());

  it('are created once with a path, and listed for the owner without their token', async () => {
    const link = await createLink('viewer', 7);
    assert.match(link.token, /^fb_link_[\w-]{32}$/);
    assert.equal(link.path, `/s/${link.token}`);
    assert.equal(link.role, 'viewer');
    assert.equal(link.members, 0);
    const access = (await owner()('GET', `/api/projects/${id}/access`)).body;
    assert.deepEqual(access.links, [{ id: link.id, role: 'viewer', createdAt: link.createdAt, expiresAt: link.expiresAt, members: 0 }]);
    assert.ok(!JSON.stringify(access).includes(link.token));
  });

  it('let signed-in people join with the link role, once', async () => {
    const link = await createLink('viewer');
    assert.equal(await roleOf('Sam'), 'none');
    const joined = await join('Sam', link.token);
    assert.deepEqual(joined.body, { projectId: id, role: 'viewer' });
    assert.equal(await roleOf('Sam'), 'viewer');
    assert.deepEqual((await join('Sam', link.token)).body, { projectId: id, role: 'viewer' });

    const access = (await owner()('GET', `/api/projects/${id}/access`)).body;
    assert.equal(access.grants.find((g) => g.user.name === 'Sam').viaLink, true);
    assert.equal(access.links.find((l) => l.id === link.id).members, 1);
    // people with access do not see links or invitations
    const asSam = (await server.as('Sam')('GET', `/api/projects/${id}/access`)).body;
    assert.equal(asSam.links, undefined);
    assert.equal(asSam.invites, undefined);
  });

  it('never lower the access someone already has', async () => {
    const viewerLink = await createLink('viewer');
    const editorLink = await createLink('editor');
    await server.grant(id, 'Eddie', 'editor', 'Olivia');
    assert.equal((await join('Eddie', viewerLink.token)).body.role, 'editor');
    assert.equal((await join('Olivia', editorLink.token)).body.role, 'owner');
    await join('Vera', viewerLink.token);
    assert.equal((await join('Vera', editorLink.token)).body.role, 'editor');
  });

  it('remove everyone who joined through a link when it is revoked, but not people added directly', async () => {
    const link = await createLink('editor');
    await join('Lin', link.token);
    await join('Lou', link.token);
    await server.grant(id, 'Dora', 'viewer', 'Olivia');
    await join('Dora', link.token); // raised to editor through the link
    // the owner sets Lou's role directly: Lou no longer depends on the link
    const louId = (await server.as('Lou')('GET', '/api/me')).body.id;
    await owner()('PUT', `/api/projects/${id}/access/members/${louId}`, { role: 'editor' });

    assert.equal((await owner()('DELETE', `/api/projects/${id}/access/links/${link.id}`)).status, 204);
    assert.equal(await roleOf('Lin'), 'none');
    assert.equal(await roleOf('Dora'), 'none'); // her access came from the link at the end
    assert.equal(await roleOf('Lou'), 'editor');
    assert.equal((await join('Max', link.token)).status, 404);
    assert.equal((await owner()('DELETE', `/api/projects/${id}/access/links/${link.id}`)).status, 404);
  });

  it('refuse invalid tokens, token clients and unauthenticated use', async () => {
    for (const token of ['fb_link_' + 'x'.repeat(32), 'nope', '', undefined]) {
      assert.equal((await join('Sam', token)).status, 404, String(token));
    }
    const link = await createLink('viewer');
    assert.equal((await server.anonymous('POST', '/api/share/join', { token: link.token })).status, 401);
    const { token: pat } = (await server.as('Sam')('POST', '/api/tokens', { name: 'Script', expiresInDays: 1 })).body;
    const viaToken = await server.anonymous('POST', '/api/share/join', { token: link.token }, { headers: { Authorization: `Bearer ${pat}`, Origin: null } });
    assert.equal(viaToken.status, 403);
    const page = await server.anonymous('GET', `/s/${link.token}`);
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), `/auth/login?returnTo=${encodeURIComponent(`/s/${link.token}`)}`);
    const signedIn = await server.request('GET', `/s/${link.token}`);
    assert.equal(signedIn.status, 200);
    assert.match(signedIn.body, /Opening shared project/);
  });

  it('validate role and expiry', async () => {
    for (const body of [{ role: 'owner' }, { role: 'viewer', expiresInDays: 0 }, { role: 'viewer', expiresInDays: 366 }, { role: 'viewer', expiresInDays: '7' }]) {
      assert.equal((await owner()('POST', `/api/projects/${id}/access/links`, body)).status, 400, JSON.stringify(body));
    }
    const noLimit = await owner()('POST', `/api/projects/${id}/access/links`, { role: 'viewer' });
    assert.equal(noLimit.status, 201);
    assert.equal(noLimit.body.expiresAt, null);
  });

  it('are logged with the other access changes', async () => {
    const log = (await owner()('GET', `/api/projects/${id}/access/log`)).body;
    const actions = log.map((e) => e.action);
    for (const action of ['project.create', 'link.create', 'link.join', 'member.set', 'link.revoke']) assert.ok(actions.includes(action), action);
    assert.equal(log.at(-1).action, 'project.create'); // newest first
    assert.equal(log.at(-1).actor.name, 'Olivia');
    const revoke = log.find((e) => e.action === 'link.revoke');
    assert.equal(revoke.details.removedMembers, 2);
    assert.equal((await server.as('Sam')('GET', `/api/projects/${id}/access/log`)).status, 403);
  });
});

describe('invitations by email', () => {
  const SECRET = 'proxy-secret-0123456789';
  let server;
  let id;
  // trusted-headers sign-in, because invitations are matched by the email the sign-in provides
  const as = (user, email) => (method, path, body) => server.anonymous(method, path, body, {
    headers: { 'x-proxy-secret': SECRET, 'x-forwarded-user': user, 'x-forwarded-email': email }
  });
  const alice = as('alice', 'alice@example.com');

  before(async () => {
    server = await startServer({ AUTH: 'trusted-headers', AUTH_PROXY_SECRET: SECRET, AUTH_EMAIL_HEADER: 'x-forwarded-email' });
    id = (await alice('POST', '/api/projects', { name: 'Invites' })).body.id;
  });
  after(() => server.stop());

  it('give access at the first sign-in with that email', async () => {
    const res = await alice('POST', `/api/projects/${id}/access/invites`, { email: ' Bob@Example.COM ', role: 'editor' });
    assert.equal(res.body.result, 'invited');
    assert.deepEqual(res.body.access.invites.map((i) => [i.email, i.role]), [['bob@example.com', 'editor']]);

    const bob = as('bob', 'bob@example.com');
    const project = await bob('GET', `/api/projects/${id}`);
    assert.equal(project.status, 200);
    assert.equal(project.body.role, 'editor');
    const access = (await alice('GET', `/api/projects/${id}/access`)).body;
    assert.deepEqual(access.invites, []);
    assert.equal(access.grants.find((g) => g.user.email === 'bob@example.com').viaLink, false);
  });

  it('give a known user access at once', async () => {
    const carol = as('carol', 'carol@example.com');
    await carol('GET', '/api/me');
    const res = await alice('POST', `/api/projects/${id}/access/invites`, { email: 'carol@example.com', role: 'viewer' });
    assert.equal(res.body.result, 'granted');
    assert.equal((await carol('GET', `/api/projects/${id}`)).body.role, 'viewer');
  });

  it('can be cancelled before they are used', async () => {
    await alice('POST', `/api/projects/${id}/access/invites`, { email: 'dave@example.com', role: 'viewer' });
    assert.equal((await alice('DELETE', `/api/projects/${id}/access/invites/${encodeURIComponent('DAVE@example.com')}`)).status, 204);
    assert.equal((await as('dave', 'dave@example.com')('GET', `/api/projects/${id}`)).status, 404);
  });

  it('are validated', async () => {
    assert.equal((await alice('POST', `/api/projects/${id}/access/invites`, { email: 'not-an-email', role: 'viewer' })).status, 400);
    assert.equal((await alice('POST', `/api/projects/${id}/access/invites`, { email: 'eve@example.com', role: 'admin' })).status, 400);
    assert.equal((await alice('POST', `/api/projects/${id}/access/invites`, { email: 'alice@example.com', role: 'viewer' })).status, 400);
  });

  it('are logged', async () => {
    const actions = (await alice('GET', `/api/projects/${id}/access/log`)).body.map((e) => e.action);
    for (const action of ['invite.create', 'invite.accept', 'member.set', 'invite.remove']) assert.ok(actions.includes(action), action);
  });
});

// Ownership, roles and sharing: who may do what with a project.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagram, startServer } from './helpers/server.mjs';

let server;
let id;
let version;
const ids = {};
before(async () => {
  server = await startServer();
  id = (await server.as('Olivia')('POST', '/api/projects', { name: 'Shared plan', xml: diagram('Shared') })).body.id;
  version = (await server.as('Olivia')('GET', `/api/projects/${id}`)).body.version;
  ids.eddie = await server.grant(id, 'Eddie', 'editor', 'Olivia');
  ids.vera = await server.grant(id, 'Vera', 'viewer', 'Olivia');
  ids.sam = (await server.as('Sam')('GET', '/api/me')).body.id; // signed in, no access
  ids.extra = (await server.as('Extra')('GET', '/api/me')).body.id;
});
after(() => server.stop());

const ROLE_OF_USER = { Olivia: 'owner', Eddie: 'editor', Vera: 'viewer', Sam: 'none' };
const RANK = { none: 0, viewer: 1, editor: 2, owner: 3 };

describe('every project route checks the role', () => {
  // [description, minimum role, request, status when allowed]
  const routes = [
    ['open', 'viewer', () => ['GET', `/api/projects/${id}`], 200],
    ['list versions', 'viewer', () => ['GET', `/api/projects/${id}/history`], 200],
    ['read a version', 'viewer', () => ['GET', `/api/projects/${id}/history/${version}`], 200],
    ['download', 'viewer', () => ['GET', `/api/projects/${id}/download`], 200],
    ['see who has access', 'viewer', () => ['GET', `/api/projects/${id}/access`], 200],
    ['save', 'editor', () => ['PUT', `/api/projects/${id}`, { xml: diagram('Saved'), force: true }], 200],
    ['rename', 'editor', () => ['PATCH', `/api/projects/${id}`, { name: 'Shared plan' }], 200],
    ['chat', 'editor', () => ['POST', `/api/projects/${id}/chat`, { message: 'Hi', xml: diagram() }], 200],
    ['change visibility', 'owner', () => ['PATCH', `/api/projects/${id}/access`, { visibility: 'private' }], 200],
    ['grant access', 'owner', () => ['PUT', `/api/projects/${id}/access/members/${ids.extra}`, { role: 'viewer' }], 200],
    ['remove access', 'owner', () => ['DELETE', `/api/projects/${id}/access/members/${ids.extra}`], 204],
    ['create a share link', 'owner', () => ['POST', `/api/projects/${id}/access/links`, { role: 'viewer', expiresInDays: 1 }], 201],
    ['revoke a share link', 'owner', () => ['DELETE', `/api/projects/${id}/access/links/no-such-link`], 404],
    ['invite by email', 'owner', () => ['POST', `/api/projects/${id}/access/invites`, { email: 'someone@example.com', role: 'viewer' }], 200],
    ['cancel an invitation', 'owner', () => ['DELETE', `/api/projects/${id}/access/invites/nobody%40example.com`], 404],
    ['read the access log', 'owner', () => ['GET', `/api/projects/${id}/access/log`], 200]
  ];

  for (const [description, minimum, makeRequest, okStatus] of routes) {
    for (const [user, role] of Object.entries(ROLE_OF_USER)) {
      const expected = role === 'none' ? 404 : RANK[role] >= RANK[minimum] ? okStatus : 403;
      it(`${description} as ${role} → ${expected}`, async () => {
        if (description === 'remove access' && RANK[role] >= RANK[minimum]) {
          await server.as('Olivia')('PUT', `/api/projects/${id}/access/members/${ids.extra}`, { role: 'viewer' });
        }
        const [method, path, body] = makeRequest();
        const res = await server.as(user)(method, path, body);
        assert.equal(res.status, expected, JSON.stringify(res.body));
        if (expected === 404 && role === 'none') assert.deepEqual(res.body, { error: 'Project not found' });
        if (expected === 403) assert.match(res.body.error, minimum === 'owner' ? /Only the owner/ : /view this project but not change it/);
      });
    }
  }

  it('live: viewers may join and share presence, only editors may share diagram changes', async () => {
    for (const [user, role] of Object.entries(ROLE_OF_USER)) {
      const controller = new AbortController();
      const res = await fetch(`${server.base}/api/projects/${id}/live?client=client-${user.toLowerCase()}-1`, {
        signal: controller.signal, headers: { Cookie: await server.signIn(user) }
      });
      assert.equal(res.status, role === 'none' ? 404 : 200, user);
      if (role !== 'none') {
        const post = (body) => server.as(user)('POST', `/api/projects/${id}/live`, { client: `client-${user.toLowerCase()}-1`, ...body });
        await new Promise((r) => setTimeout(r, 50));
        assert.equal((await post({ type: 'cursor', cursor: { x: 1, y: 2 } })).status, 200, user);
        const doc = await post({ type: 'doc', xml: diagram('Live') });
        assert.equal(doc.status, role === 'viewer' ? 403 : 200, user);
      }
      controller.abort();
    }
  });

  it('answers 405 for unsupported methods before checking the role', async () => {
    assert.equal((await server.as('Vera')('DELETE', `/api/projects/${id}`)).status, 405);
    assert.equal((await server.as('Sam')('DELETE', `/api/projects/${id}`)).status, 404);
  });
});

describe('sharing', () => {
  it('keeps new projects private to their creator', async () => {
    const own = (await server.as('Nina')('POST', '/api/projects', { name: 'Private by default' })).body.id;
    const project = (await server.as('Nina')('GET', `/api/projects/${own}`)).body;
    assert.equal(project.role, 'owner');
    assert.equal(project.visibility, 'private');
    assert.equal(project.owner.name, 'Nina');
    assert.equal((await server.as('Sam')('GET', `/api/projects/${own}`)).status, 404);
    assert.ok(!(await server.as('Sam')('GET', '/api/projects')).body.some((p) => p.id === own));
  });

  it('lists the projects each user can see, with their role', async () => {
    const roles = async (user) => Object.fromEntries((await server.as(user)('GET', '/api/projects')).body.map((p) => [p.id, p.role]));
    assert.equal((await roles('Olivia'))[id], 'owner');
    assert.equal((await roles('Eddie'))[id], 'editor');
    assert.equal((await roles('Vera'))[id], 'viewer');
    assert.equal((await roles('Sam'))[id], undefined);
  });

  it('lets every signed-in user view a project shared with everyone, but not edit it', async () => {
    const open = (await server.as('Olivia')('POST', '/api/projects', { name: 'For everyone' })).body.id;
    const changed = await server.as('Olivia')('PATCH', `/api/projects/${open}/access`, { visibility: 'everyone' });
    assert.equal(changed.body.visibility, 'everyone');
    assert.equal((await server.as('Sam')('GET', `/api/projects/${open}`)).body.role, 'viewer');
    assert.ok((await server.as('Sam')('GET', '/api/projects')).body.some((p) => p.id === open && p.role === 'viewer'));
    assert.equal((await server.as('Sam')('PUT', `/api/projects/${open}`, { xml: diagram(), force: true })).status, 403);
    // a grant can still raise the role above what everyone has
    await server.grant(open, 'Sam', 'editor', 'Olivia');
    assert.equal((await server.as('Sam')('PUT', `/api/projects/${open}`, { xml: diagram(), force: true })).status, 200);
    await server.as('Olivia')('PATCH', `/api/projects/${open}/access`, { visibility: 'private' });
    assert.equal((await server.as('Vera')('GET', `/api/projects/${open}`)).status, 404);
  });

  it('shows who has access and lets the owner change roles', async () => {
    const access = (await server.as('Vera')('GET', `/api/projects/${id}/access`)).body;
    assert.equal(access.owner.name, 'Olivia');
    assert.deepEqual(access.grants.map((g) => [g.user.name, g.role]), [['Eddie', 'editor'], ['Vera', 'viewer']]);

    const raised = await server.as('Olivia')('PUT', `/api/projects/${id}/access/members/${ids.vera}`, { role: 'editor' });
    assert.equal(raised.body.grants.find((g) => g.user.id === ids.vera).role, 'editor');
    assert.equal((await server.as('Vera')('PATCH', `/api/projects/${id}`, { name: 'Shared plan' })).status, 200);
    await server.as('Olivia')('PUT', `/api/projects/${id}/access/members/${ids.vera}`, { role: 'viewer' });
    assert.equal((await server.as('Vera')('PATCH', `/api/projects/${id}`, { name: 'Shared plan' })).status, 403);
  });

  it('validates grants', async () => {
    const owner = server.as('Olivia');
    const oliviaId = (await owner('GET', '/api/me')).body.id;
    assert.equal((await owner('PUT', `/api/projects/${id}/access/members/${oliviaId}`, { role: 'viewer' })).status, 400);
    assert.equal((await owner('PUT', `/api/projects/${id}/access/members/no-such-user`, { role: 'viewer' })).status, 404);
    assert.equal((await owner('PUT', `/api/projects/${id}/access/members/${ids.sam}`, { role: 'owner' })).status, 400);
    assert.equal((await owner('PATCH', `/api/projects/${id}/access`, { visibility: 'public' })).status, 400);
    assert.equal((await owner('DELETE', `/api/projects/${id}/access/members/${ids.sam}`)).status, 404);
  });

  it('lets users remove their own access', async () => {
    const project = (await server.as('Olivia')('POST', '/api/projects', { name: 'Leave me' })).body.id;
    const leaverId = await server.grant(project, 'Leaver', 'editor', 'Olivia');
    assert.equal((await server.as('Leaver')('DELETE', `/api/projects/${project}/access/members/${leaverId}`)).status, 204);
    assert.equal((await server.as('Leaver')('GET', `/api/projects/${project}`)).status, 404);
  });

  it('applies the same roles to access tokens', async () => {
    const { token } = (await server.as('Vera')('POST', '/api/tokens', { name: 'Script', expiresInDays: 1 })).body;
    const asToken = (method, path, body) => server.anonymous(method, path, body, { headers: { Authorization: `Bearer ${token}`, Origin: null } });
    assert.equal((await asToken('GET', `/api/projects/${id}`)).status, 200);
    assert.equal((await asToken('PUT', `/api/projects/${id}`, { xml: diagram(), force: true })).status, 403);
  });
});

describe('user search', () => {
  it('finds signed-in users by name or email, case-insensitively', async () => {
    const search = async (q) => (await server.as('Olivia')('GET', `/api/users?q=${encodeURIComponent(q)}`)).body.map((u) => u.name);
    assert.deepEqual(await search('v'), []); // at least two characters
    assert.deepEqual(await search('VERA'), ['Vera']);
    assert.deepEqual(await search('edd'), ['Eddie']);
    assert.deepEqual(await search('ver'), ['Leaver', 'Vera']); // contains, sorted by name
    assert.deepEqual(await search('%'), []);
    assert.deepEqual(await search('__'), []);
    assert.equal((await server.anonymous('GET', '/api/users?q=vera')).status, 401);
  });
});

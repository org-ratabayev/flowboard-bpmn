// The MCP endpoint /mcp: sign-in rules (personal access tokens; the proxy's identity with
// trusted-headers; no cookies), the Origin check, methods, the MCP_SERVER switch and list_diagrams,
// driven with the official MCP client over HTTP against a real server process.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startServer } from './helpers/server.mjs';

const INITIALIZE = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '1.0.0' } }
};

/** A plain POST to /mcp (no client library), for checking statuses and headers. */
function post(server, headers = {}, method = 'POST') {
  return fetch(`${server.base}/mcp`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: method === 'POST' ? JSON.stringify(INITIALIZE) : undefined
  });
}

async function connect(server, headers) {
  const client = new Client({ name: 'flowboard-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), { requestInit: { headers } }));
  return client;
}

async function listDiagrams(client, args = {}) {
  const result = await client.callTool({ name: 'list_diagrams', arguments: args });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  return result.structuredContent;
}

const tokenOf = async (server, name) => (await server.as(name)('POST', '/api/tokens', { name: 'MCP', expiresInDays: 1 })).body.token;

describe('MCP endpoint with personal access tokens', () => {
  let server;
  let annToken;
  before(async () => {
    server = await startServer();
    annToken = await tokenOf(server, 'Ann');
  });
  after(() => server.stop());

  it('serves list_diagrams to a client with a token', async () => {
    const client = await connect(server, { Authorization: `Bearer ${annToken}` });
    try {
      assert.deepEqual((await client.listTools()).tools.map((t) => t.name), ['list_diagrams']);
      assert.equal((await listDiagrams(client)).total, 0);
    } finally {
      await client.close();
    }
  });

  it('answers 401 with a Bearer challenge to everything but a valid token', async () => {
    const cookie = await server.signIn('Ann');
    const attempts = {
      'no credentials': {},
      'invalid token': { Authorization: `Bearer fb_pat_${'x'.repeat(43)}` },
      'malformed header': { Authorization: annToken },
      'session cookie only': { Cookie: cookie, Origin: server.base },
      'invalid token with a cookie': { Authorization: 'Bearer fb_pat_nope', Cookie: cookie },
      'bearer that is not a token': { Authorization: 'Bearer some-proxy-token' }
    };
    for (const [label, headers] of Object.entries(attempts)) {
      const res = await post(server, headers);
      assert.equal(res.status, 401, label);
      assert.equal(res.headers.get('www-authenticate'), 'Bearer', label);
      assert.match((await res.json()).error, /access token/, label);
    }
    await assert.rejects(connect(server, { Authorization: 'Bearer fb_pat_nope' }));
  });

  it('refuses a foreign Origin and accepts its own', async () => {
    const auth = { Authorization: `Bearer ${annToken}` };
    assert.equal((await post(server, { ...auth, Origin: 'https://evil.example.com' })).status, 403);
    assert.equal((await post(server, { ...auth, Origin: 'null' })).status, 403);
    assert.equal((await post(server, { ...auth, Origin: server.base })).status, 200);
  });

  it('has no session operations', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await post(server, { Authorization: `Bearer ${annToken}` }, method);
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.get('allow'), 'POST');
    }
  });

  it('refuses bodies over 4 MiB', async () => {
    const res = await fetch(`${server.base}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${annToken}`, 'Content-Type': 'application/json' },
      body: 'x'.repeat(4 * 1024 * 1024 + 1)
    });
    assert.equal(res.status, 413);
  });
});

describe('MCP list_diagrams', () => {
  let server;
  let client;
  before(async () => {
    server = await startServer();
    const olga = server.as('Olga');
    const create = async (name, as = olga) => (await as('POST', '/api/projects', { name })).body.id;
    const shared = await create('Beta flow');
    await server.grant(shared, 'Ann', 'editor', 'Olga');
    const sharedPublic = await create('Epsilon');
    await olga('PATCH', `/api/projects/${sharedPublic}/access`, { visibility: 'everyone' });
    await server.grant(sharedPublic, 'Ann', 'viewer', 'Olga');
    const pub = await create('Gamma public');
    await olga('PATCH', `/api/projects/${pub}/access`, { visibility: 'everyone' });
    await create('Delta private');
    const gone = await create('Zeta deleted');
    await server.grant(gone, 'Ann', 'editor', 'Olga');
    assert.equal((await olga('DELETE', `/api/projects/${gone}`)).status, 204);
    await create('Ann own', server.as('Ann')); // created last, so it is listed first
    client = await connect(server, { Authorization: `Bearer ${await tokenOf(server, 'Ann')}` });
  });
  after(async () => {
    await client?.close();
    await server.stop();
  });

  const ids = async (args) => (await listDiagrams(client, args)).diagrams.map((d) => d.id).sort();

  it('lists what the caller can open, by scope, without deleted projects', async () => {
    assert.deepEqual(await ids({}), ['ann-own', 'beta-flow', 'epsilon', 'gamma-public']);
    assert.deepEqual(await ids({ scope: 'all' }), ['ann-own', 'beta-flow', 'epsilon', 'gamma-public']);
    assert.deepEqual(await ids({ scope: 'mine' }), ['ann-own']);
    assert.deepEqual(await ids({ scope: 'shared' }), ['beta-flow', 'epsilon']);
    assert.deepEqual(await ids({ scope: 'everyone' }), ['gamma-public']);
  });

  it('returns role, update time and the editor link', async () => {
    const { diagrams } = await listDiagrams(client);
    const byId = Object.fromEntries(diagrams.map((d) => [d.id, d]));
    assert.deepEqual(Object.fromEntries(diagrams.map((d) => [d.id, d.role])),
      { 'ann-own': 'owner', 'beta-flow': 'editor', epsilon: 'viewer', 'gamma-public': 'viewer' });
    assert.deepEqual(Object.keys(byId['beta-flow']).sort(), ['id', 'name', 'role', 'updatedAt', 'url']);
    assert.equal(byId['beta-flow'].name, 'Beta flow');
    assert.equal(byId['beta-flow'].url, `${server.base}/p/beta-flow`);
    assert.ok(!Number.isNaN(Date.parse(byId['beta-flow'].updatedAt)));
  });

  it('finds by name or id, case-insensitively', async () => {
    assert.deepEqual(await ids({ query: 'BETA' }), ['beta-flow']);
    assert.deepEqual(await ids({ query: 'gamma-pub' }), ['gamma-public']);
    assert.deepEqual(await ids({ query: 'private' }), []);
    assert.deepEqual(await ids({ query: 'deleted' }), []);
  });

  it('pages with limit and offset', async () => {
    const first = await listDiagrams(client, { limit: 3 });
    const rest = await listDiagrams(client, { limit: 3, offset: 3 });
    assert.equal(first.diagrams.length, 3);
    assert.equal(rest.diagrams.length, 1);
    assert.equal(first.total, 4);
    assert.equal(first.diagrams[0].id, 'ann-own');
    assert.deepEqual([...first.diagrams, ...rest.diagrams].map((d) => d.id).sort(), await ids({}));
    const bad = await client.callTool({ name: 'list_diagrams', arguments: { limit: 101 } }).catch((err) => ({ isError: true, err }));
    assert.equal(bad.isError, true);
  });

  it('reads the role on every call', async () => {
    const userId = (await server.as('Ann')('GET', '/api/me')).body.id;
    await server.as('Olga')('DELETE', `/api/projects/beta-flow/access/members/${userId}`);
    assert.deepEqual(await ids({ scope: 'shared' }), ['epsilon']);
  });
});

describe('MCP behind an authenticating proxy (trusted-headers)', () => {
  const SECRET = 'proxy-secret-0123456789';
  const proxied = (extra = {}) => ({ 'x-proxy-secret': SECRET, 'x-forwarded-user': 'pia', Authorization: 'Bearer proxy-issued-token', ...extra });
  let server;
  before(async () => { server = await startServer({ AUTH: 'trusted-headers', AUTH_PROXY_SECRET: SECRET }); });
  after(() => server.stop());

  it('takes the identity from the proxy when a non-token bearer is sent', async () => {
    const created = await server.anonymous('POST', '/api/projects', { name: 'Via proxy' }, { headers: { 'x-proxy-secret': SECRET, 'x-forwarded-user': 'pia' } });
    assert.equal(created.status, 201);
    const client = await connect(server, proxied());
    try {
      const { diagrams } = await listDiagrams(client);
      assert.deepEqual(diagrams.map((d) => [d.id, d.role]), [['via-proxy', 'owner']]);
    } finally {
      await client.close();
    }
  });

  it('needs the proxy secret, the identity headers and a bearer', async () => {
    const cases = {
      'without the proxy secret': proxied({ 'x-proxy-secret': undefined }),
      'with a wrong proxy secret': proxied({ 'x-proxy-secret': 'wrong-secret-0123456789' }),
      'without identity headers': proxied({ 'x-forwarded-user': undefined }),
      'without a bearer': proxied({ Authorization: undefined }),
      'with an invalid personal token': proxied({ Authorization: 'Bearer fb_pat_nope' })
    };
    for (const [label, headers] of Object.entries(cases)) {
      const clean = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined));
      const res = await post(server, clean);
      assert.equal(res.status, 401, label);
      assert.equal(res.headers.get('www-authenticate'), 'Bearer', label);
    }
  });

  it('keeps the REST rule: a bearer that is not a token is refused on /api', async () => {
    assert.equal((await server.anonymous('GET', '/api/me', undefined, { headers: proxied() })).status, 401);
  });

  it('still accepts personal access tokens', async () => {
    const viaProxy = { headers: { 'x-proxy-secret': SECRET, 'x-forwarded-user': 'pia' } };
    const { token } = (await server.anonymous('POST', '/api/tokens', { name: 'MCP', expiresInDays: 1 }, viaProxy)).body;
    const client = await connect(server, { Authorization: `Bearer ${token}` });
    try {
      assert.equal((await listDiagrams(client)).total, 1);
    } finally {
      await client.close();
    }
  });
});

describe('MCP_SERVER=off', () => {
  let server;
  before(async () => { server = await startServer({ MCP_SERVER: 'off' }); });
  after(() => server.stop());

  it('answers 404 on /mcp', async () => {
    const token = await tokenOf(server, 'Ann');
    assert.equal((await post(server, { Authorization: `Bearer ${token}` })).status, 404);
  });
});

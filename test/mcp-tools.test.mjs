// The MCP read tools on one diagram: roles (none / viewer / editor / owner) read on every call,
// deleted projects and foreign version ids as "not found", live drafts, version history, export,
// shares without secrets, and summaries of stored XML that does not parse.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { callError, callOk, connect, tokenOf } from './helpers/mcp.mjs';
import { diagram, openLive, startServer } from './helpers/server.mjs';

const ROLES = ['none', 'viewer', 'editor', 'owner'];

describe('MCP read tools', () => {
  let server;
  const clients = {};
  let versions; // of "plan", newest first
  let otherVersion;
  let linkToken;

  before(async () => {
    server = await startServer();
    const olga = server.as('Olga');
    await olga('POST', '/api/projects', { name: 'Plan' });
    const base = (await olga('GET', '/api/projects/plan')).body.version;
    assert.equal((await olga('PUT', '/api/projects/plan', { xml: diagram('Second'), baseVersion: base, note: 'Renamed the task' })).status, 200);
    versions = (await olga('GET', '/api/projects/plan/history')).body.map((v) => v.version);
    await olga('POST', '/api/projects', { name: 'Other' });
    otherVersion = (await olga('GET', '/api/projects/other')).body.version;
    await server.grant('plan', 'Vic', 'viewer', 'Olga');
    await server.grant('plan', 'Ed', 'editor', 'Olga');
    linkToken = (await olga('POST', '/api/projects/plan/access/links', { role: 'viewer', expiresInDays: 7 })).body.token;
    assert.ok(linkToken);
    await olga('POST', '/api/projects/plan/access/invites', { role: 'editor', email: 'newcomer@example.com' });
    const users = { none: 'Nora', viewer: 'Vic', editor: 'Ed', owner: 'Olga' };
    for (const role of ROLES) clients[role] = await connect(server, { Authorization: `Bearer ${await tokenOf(server, users[role])}` });
  });
  after(async () => {
    for (const client of Object.values(clients)) await client.close();
    await server.stop();
  });

  it('gives every tool by role: nothing without access, list_shares to the owner only', async () => {
    const calls = {
      get_diagram: { diagramId: 'plan' },
      get_diagram_summary: { diagramId: 'plan' },
      list_versions: { diagramId: 'plan' },
      get_version: { diagramId: 'plan', versionId: versions[1] },
      export_diagram: { diagramId: 'plan' },
      list_shares: { diagramId: 'plan' }
    };
    for (const [tool, args] of Object.entries(calls)) {
      for (const role of ROLES) {
        const label = `${tool} as ${role}`;
        if (role === 'none') assert.equal(await callError(clients[role], tool, args), 'Diagram not found', label);
        else if (tool === 'list_shares' && role !== 'owner') assert.equal(await callError(clients[role], tool, args), 'Only the owner can see who has access', label);
        else assert.equal((await callOk(clients[role], tool, args)).id ?? 'export', tool === 'export_diagram' ? 'export' : 'plan', label);
      }
    }
    // unknown and malformed ids look the same as ones without access
    for (const diagramId of ['missing', '../plan', 'PLAN']) assert.equal(await callError(clients.owner, 'get_diagram', { diagramId }), 'Diagram not found');
  });

  it('returns the diagram with its saved version and editor link', async () => {
    const got = await callOk(clients.viewer, 'get_diagram', { diagramId: 'plan' });
    assert.deepEqual({ ...got, xml: undefined, savedAt: undefined }, {
      id: 'plan', name: 'Plan', role: 'viewer', url: `${server.base}/p/plan`, versionId: versions[0], savedBy: 'Olga', xml: undefined, savedAt: undefined
    });
    assert.match(got.xml, /name="Second"/);
    assert.ok(!('dirty' in got));
  });

  it('includes unsaved live changes only when asked, and only from this instance', async () => {
    const plain = await callOk(clients.viewer, 'get_diagram', { diagramId: 'plan', includeUnsaved: true });
    assert.equal(plain.dirty, false);
    assert.match(plain.xml, /name="Second"/);
    const tab = await openLive(server, 'plan', 'client-mcp-1', 'Ed');
    try {
      await tab.next('hello');
      assert.equal((await tab.post({ type: 'doc', xml: diagram('Draft task') })).status, 200);
      const live = await callOk(clients.viewer, 'get_diagram', { diagramId: 'plan', includeUnsaved: true });
      assert.equal(live.dirty, true);
      assert.match(live.xml, /name="Draft task"/);
      assert.equal(live.versionId, versions[0]);
      assert.match((await callOk(clients.viewer, 'get_diagram', { diagramId: 'plan' })).xml, /name="Second"/);
      const summary = await callOk(clients.viewer, 'get_diagram_summary', { diagramId: 'plan', includeUnsaved: true });
      assert.equal(summary.dirty, true);
      assert.ok(JSON.stringify(summary.summary).includes('Draft task'));
    } finally {
      tab.close();
    }
  });

  it('summarizes the latest version', async () => {
    const { summary, versionId } = await callOk(clients.viewer, 'get_diagram_summary', { diagramId: 'plan' });
    assert.equal(versionId, versions[0]);
    assert.ok(JSON.stringify(summary).includes('Second'));
    assert.ok(!JSON.stringify(summary).includes('<bpmn'));
  });

  it('lists versions newest first, paged, without XML', async () => {
    const all = await callOk(clients.viewer, 'list_versions', { diagramId: 'plan' });
    assert.equal(all.total, 2);
    assert.deepEqual(all.versions.map((v) => v.versionId), versions);
    assert.deepEqual(Object.keys(all.versions[0]).sort(), ['author', 'createdAt', 'note', 'source', 'versionId']);
    assert.deepEqual({ ...all.versions[0], createdAt: undefined }, { versionId: versions[0], author: 'Olga', source: 'editor', note: 'Renamed the task', createdAt: undefined });
    const second = await callOk(clients.viewer, 'list_versions', { diagramId: 'plan', limit: 1, offset: 1 });
    assert.deepEqual(second.versions.map((v) => v.versionId), [versions[1]]);
    assert.equal(second.total, 2);
  });

  it('reads one version of the project, and only of that project', async () => {
    const old = await callOk(clients.viewer, 'get_version', { diagramId: 'plan', versionId: versions[1] });
    assert.equal(old.versionId, versions[1]);
    assert.equal(old.note, 'Created');
    assert.doesNotMatch(old.xml, /Second/);
    for (const versionId of [otherVersion, 'not-a-version', '2020-01-01T00-00-00-000Z']) {
      assert.equal(await callError(clients.owner, 'get_version', { diagramId: 'plan', versionId }), 'Version not found', versionId);
      assert.equal(await callError(clients.owner, 'export_diagram', { diagramId: 'plan', versionId }), 'Version not found', versionId);
    }
  });

  it('exports the .bpmn file with a file name', async () => {
    const latest = await callOk(clients.viewer, 'export_diagram', { diagramId: 'plan' });
    assert.equal(latest.fileName, 'plan.bpmn');
    assert.equal(latest.versionId, versions[0]);
    assert.match(latest.content, /name="Second"/);
    const old = await callOk(clients.viewer, 'export_diagram', { diagramId: 'plan', versionId: versions[1] });
    assert.equal(old.fileName, `plan-${versions[1]}.bpmn`);
  });

  it('lists shares to the owner without any secrets', async () => {
    const result = await clients.owner.callTool({ name: 'list_shares', arguments: { diagramId: 'plan' } });
    const shares = result.structuredContent;
    assert.deepEqual(shares.members.map((m) => [m.name, m.role, m.viaLink]), [['Ed', 'editor', false], ['Vic', 'viewer', false]]);
    assert.deepEqual(shares.owner, { name: 'Olga', email: null });
    assert.equal(shares.links.length, 1);
    assert.deepEqual(Object.keys(shares.links[0]).sort(), ['createdAt', 'expiresAt', 'id', 'members', 'role']);
    assert.deepEqual(shares.invites.map((i) => [i.email, i.role]), [['newcomer@example.com', 'editor']]);
    const everything = JSON.stringify(result);
    assert.ok(!everything.includes(linkToken), 'no link token');
    assert.ok(!/fb_link_|fb_pat_|hash/i.test(everything), 'no token material');
  });

  it('treats a deleted project as not found, for its owner too', async () => {
    const olga = server.as('Olga');
    await olga('POST', '/api/projects', { name: 'Gone' });
    const goneVersion = (await olga('GET', '/api/projects/gone')).body.version;
    assert.equal((await callOk(clients.owner, 'get_diagram', { diagramId: 'gone' })).id, 'gone');
    assert.equal((await olga('DELETE', '/api/projects/gone')).status, 204);
    const calls = [['get_diagram', {}], ['get_diagram_summary', {}], ['list_versions', {}], ['get_version', { versionId: goneVersion }], ['export_diagram', {}], ['list_shares', {}]];
    for (const [tool, args] of calls) assert.equal(await callError(clients.owner, tool, { diagramId: 'gone', ...args }), 'Diagram not found', tool);
  });

  it('reads the role on every call', async () => {
    const userId = (await server.as('Vic')('GET', '/api/me')).body.id;
    await server.as('Olga')('POST', '/api/projects', { name: 'Brief' });
    await server.grant('brief', 'Vic', 'viewer', 'Olga');
    assert.equal((await callOk(clients.viewer, 'get_diagram', { diagramId: 'brief' })).id, 'brief');
    await server.as('Olga')('DELETE', `/api/projects/brief/access/members/${userId}`);
    assert.equal(await callError(clients.viewer, 'get_diagram', { diagramId: 'brief' }), 'Diagram not found');
  });

  it('refuses diagrams over 4 MiB with the editor link', async () => {
    const olga = server.as('Olga');
    await olga('POST', '/api/projects', { name: 'Huge' });
    const base = (await olga('GET', '/api/projects/huge')).body.version;
    const huge = diagram('Huge').replace('</bpmn:definitions>', `<!-- ${'x'.repeat(4 * 1024 * 1024)} -->\n</bpmn:definitions>`);
    assert.equal((await olga('PUT', '/api/projects/huge', { xml: huge, baseVersion: base })).status, 200);
    const hugeVersion = (await olga('GET', '/api/projects/huge')).body.version;
    const calls = [['get_diagram', {}], ['get_diagram_summary', {}], ['get_version', { versionId: hugeVersion }], ['export_diagram', {}]];
    for (const [tool, args] of calls) {
      assert.match(await callError(clients.owner, tool, { diagramId: 'huge', ...args }), new RegExp(`up to 4 MB\\. Open it in the editor: ${server.base}/p/huge$`), tool);
    }
    assert.equal((await callOk(clients.owner, 'list_versions', { diagramId: 'huge' })).total, 2);
  });

  it('returns the problems of stored XML that does not parse', async () => {
    const olga = server.as('Olga');
    await olga('POST', '/api/projects', { name: 'Broken' });
    const base = (await olga('GET', '/api/projects/broken')).body.version;
    const broken = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P"><bpmn:task';
    assert.equal((await olga('PUT', '/api/projects/broken', { xml: broken, baseVersion: base })).status, 200);
    const result = await callOk(clients.owner, 'get_diagram_summary', { diagramId: 'broken' });
    assert.equal(result.summary, undefined);
    assert.ok(result.problems.length > 0);
    assert.equal((await callOk(clients.owner, 'get_diagram', { diagramId: 'broken' })).xml, broken);
  });
});

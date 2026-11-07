// Characterization tests for the projects, history and download API and static files.
// They pin down current behavior so a reimplementation of the server can be checked
// against them (see test/helpers/server.mjs).

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { VERSION_RE, diagram, startServer } from './helpers/server.mjs';

let server;
let req;
before(async () => {
  server = await startServer();
  req = server.request;
});
after(() => server.stop());

// Oldest first, like the lines of the former log.jsonl.
const readLog = async (id) => (await req('GET', `/api/projects/${id}/history`)).body.reverse();
const readLatest = async (id) => (await req('GET', `/api/projects/${id}`)).body.xml;

describe('projects', () => {
  it('lists nothing for an empty storage folder', async () => {
    const res = await req('GET', '/api/projects');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('creates a project with defaults and a first version', async () => {
    const res = await req('POST', '/api/projects', {});
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { id: 'untitled-diagram' });

    const project = (await req('GET', '/api/projects/untitled-diagram')).body;
    assert.equal(project.name, 'Untitled diagram');
    assert.match(project.xml, /<bpmn:startEvent id="StartEvent_1"/);
    assert.match(project.version, VERSION_RE);
    const listed = (await req('GET', '/api/projects')).body.find((p) => p.id === 'untitled-diagram');
    assert.ok(!Number.isNaN(Date.parse(listed.createdAt)));

    const log = await readLog('untitled-diagram');
    assert.equal(log.length, 1);
    const [entry] = log;
    assert.equal(entry.version, project.version);
    assert.equal(entry.author, 'Tester'); // the signed-in user
    assert.equal(entry.note, 'Created');
    assert.equal(entry.size, Buffer.byteLength(project.xml));
    assert.ok(!Number.isNaN(Date.parse(entry.at)));
    assert.equal((await req('GET', `/api/projects/untitled-diagram/history/${entry.version}`)).body.xml, project.xml);
  });

  it('derives ids from names and numbers duplicates', async () => {
    const xml = diagram('Imported');
    const first = await server.as('Alice')('POST', '/api/projects', { name: '  Order Flow!  ', xml });
    const second = await req('POST', '/api/projects', { name: 'Order Flow!' });
    assert.equal(first.body.id, 'order-flow');
    assert.equal(second.body.id, 'order-flow-2');
    await server.grant('order-flow', 'Tester', 'viewer', 'Alice'); // Alice's project is private until she shares it

    const project = (await req('GET', '/api/projects/order-flow')).body;
    assert.equal(project.name, 'Order Flow!');
    assert.equal(project.xml, xml);
    assert.equal((await readLog('order-flow'))[0].author, 'Alice');
  });

  it('caps the name at 200 and the id at 60 characters', async () => {
    const res = await req('POST', '/api/projects', { name: 'x'.repeat(250) });
    assert.equal(res.body.id, 'x'.repeat(60));
    const project = await req('GET', `/api/projects/${res.body.id}`);
    assert.equal(project.body.name, 'x'.repeat(200));
  });

  it('rejects an import that is not BPMN', async () => {
    const res = await req('POST', '/api/projects', { name: 'Bad', xml: '<html></html>' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Not a BPMN file' });
  });

  it('lists projects newest first with summary fields', async () => {
    const res = await req('GET', '/api/projects');
    assert.equal(res.status, 200);
    const ids = res.body.map((p) => p.id);
    assert.deepEqual(ids.slice().sort(), ['order-flow', 'order-flow-2', 'untitled-diagram', 'x'.repeat(60)].sort());
    const updated = res.body.map((p) => p.updatedAt);
    assert.deepEqual(updated, updated.slice().sort().reverse());

    const flow = res.body.find((p) => p.id === 'order-flow');
    assert.deepEqual(Object.keys(flow).sort(), ['createdAt', 'id', 'name', 'owner', 'role', 'updatedAt', 'updatedBy', 'versionCount', 'visibility']);
    assert.equal(flow.name, 'Order Flow!');
    assert.equal(flow.updatedBy, 'Alice');
    assert.equal(flow.versionCount, 1);
    assert.equal(flow.role, 'viewer');
    assert.equal(flow.visibility, 'private');
    assert.equal(flow.owner.name, 'Alice');
    assert.equal(res.body.find((p) => p.id === 'order-flow-2').role, 'owner');
  });

  it('returns a project with its latest version', async () => {
    const res = await req('GET', '/api/projects/order-flow');
    assert.equal(res.status, 200);
    const [entry] = await readLog('order-flow');
    assert.deepEqual(res.body, {
      id: 'order-flow',
      name: 'Order Flow!',
      version: entry.version,
      xml: diagram('Imported'),
      rev: 0,
      dirty: false,
      role: 'viewer',
      visibility: 'private',
      owner: { id: res.body.owner.id, name: 'Alice' }
    });
  });

  it('answers 404 for unknown or invalid project ids', async () => {
    for (const id of ['missing', 'Bad_ID', 'no-latest-file']) {
      const res = await req('GET', `/api/projects/${id}`);
      assert.equal(res.status, 404, id);
      assert.deepEqual(res.body, { error: 'Project not found' });
    }
  });

  it('renames a project without changing its id', async () => {
    const res = await req('PATCH', '/api/projects/order-flow-2', { name: '  Renamed  ' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { id: 'order-flow-2', name: 'Renamed' });
    const empty = await req('PATCH', '/api/projects/order-flow-2', { name: '' });
    assert.deepEqual(empty.body, { id: 'order-flow-2', name: 'Renamed' });
  });

  it('does not support deleting', async () => {
    assert.equal((await req('DELETE', '/api/projects/order-flow')).status, 405);
    assert.equal((await req('DELETE', '/api/projects')).status, 405);
  });
});

describe('saving', () => {
  let id;
  let base;
  before(async () => {
    id = (await req('POST', '/api/projects', { name: 'Save test' })).body.id;
    base = (await req('GET', `/api/projects/${id}`)).body.version;
    await server.grant(id, 'Bob');
  });

  it('saves a new version on top of the latest one', async () => {
    const xml = diagram('Second');
    const res = await server.as('Bob')('PUT', `/api/projects/${id}`, { xml, baseVersion: base, note: 'Added a task' });
    assert.equal(res.status, 200);
    assert.match(res.body.version, VERSION_RE);
    assert.ok(!Number.isNaN(Date.parse(res.body.at)));
    assert.equal(typeof res.body.rev, 'number');

    assert.equal(await readLatest(id), xml);
    const log = await readLog(id);
    assert.equal(log.length, 2);
    assert.equal(log[1].version, res.body.version);
    assert.equal(log[1].author, 'Bob');
    assert.equal(log[1].note, 'Added a task');
    base = res.body.version;
  });

  it('rejects a save based on an older or missing version', async () => {
    const before = await readLatest(id);
    for (const baseVersion of ['2000-01-01T00-00-00-000Z', undefined]) {
      const res = await req('PUT', `/api/projects/${id}`, { xml: diagram('Stale'), baseVersion });
      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'conflict');
      assert.equal(res.body.latest.version, base);
      assert.equal(res.body.latest.author, 'Bob');
    }
    assert.equal(await readLatest(id), before);
    assert.equal((await readLog(id)).length, 2);
  });

  it('saves anyway when forced', async () => {
    const res = await req('PUT', `/api/projects/${id}`, { xml: diagram('Forced'), baseVersion: 'old', force: true });
    assert.equal(res.status, 200);
    assert.equal((await readLog(id)).length, 3);
  });

  it('rejects content that is not BPMN', async () => {
    const res = await req('PUT', `/api/projects/${id}`, { xml: 'nope', force: true });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Not a BPMN diagram' });
  });
});

describe('history and download', () => {
  let id;
  let versions;
  before(async () => {
    id = (await req('POST', '/api/projects', { name: 'History test', xml: diagram('One') })).body.id;
    const first = (await req('GET', `/api/projects/${id}`)).body.version;
    await server.grant(id, 'Carol');
    await server.as('Carol')('PUT', `/api/projects/${id}`, { xml: diagram('Two'), baseVersion: first, note: 'Second' });
    versions = (await req('GET', `/api/projects/${id}/history`)).body;
  });

  it('lists versions newest first', () => {
    assert.equal(versions.length, 2);
    assert.ok(versions[0].version > versions[1].version);
    assert.deepEqual(Object.keys(versions[0]).sort(), ['at', 'author', 'note', 'size', 'version']);
    assert.equal(versions[0].author, 'Carol');
    assert.equal(versions[0].note, 'Second');
    assert.equal(versions[1].note, 'Created');
    assert.equal(versions[0].size, Buffer.byteLength(diagram('Two')));
  });

  it('returns one version', async () => {
    const res = await req('GET', `/api/projects/${id}/history/${versions[1].version}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { version: versions[1].version, xml: diagram('One') });
  });

  it('validates version names', async () => {
    const bad = await req('GET', `/api/projects/${id}/history/latest`);
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body, { error: 'Bad version' });
    const missing = await req('GET', `/api/projects/${id}/history/2000-01-01T00-00-00-000Z`);
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { error: 'Version not found' });
  });

  it('downloads the latest file', async () => {
    const res = await req('GET', `/api/projects/${id}/download`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="${id}.bpmn"`);
    assert.equal(res.body, diagram('Two'));
  });

  it('downloads an older version', async () => {
    const v = versions[1].version;
    const res = await req('GET', `/api/projects/${id}/download?version=${v}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="${id}-${v}.bpmn"`);
    assert.equal(res.body, diagram('One'));
  });

  it('rejects bad or unknown download versions', async () => {
    assert.equal((await req('GET', `/api/projects/${id}/download?version=x`)).status, 400);
    assert.equal((await req('GET', `/api/projects/${id}/download?version=2000-01-01T00-00-00-000Z`)).status, 404);
  });

  it('answers 404 for unknown sub-resources', async () => {
    const res = await req('GET', `/api/projects/${id}/nothing`);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });
});

describe('static files and errors', () => {
  it('serves the project list and the editor pages', async () => {
    for (const urlPath of ['/', '/p/anything']) {
      const res = await req('GET', urlPath);
      assert.equal(res.status, 200, urlPath);
      assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    }
  });

  it('serves assets and the license list', async () => {
    const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    for (const page of ['/', '/p/anything']) {
      const html = (await req('GET', page)).body;
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      assert.ok(assets.some((a) => a.endsWith('.css')), `${page} links a stylesheet`);
      for (const asset of assets) {
        const res = await req('GET', asset);
        assert.equal(res.status, 200, asset);
        assert.equal(res.headers.get('content-type'), types[path.extname(asset)], asset);
      }
    }
    const licenses = await req('GET', '/licenses');
    assert.equal(licenses.status, 200);
    assert.equal(licenses.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(licenses.body, await fs.readFile(path.join(import.meta.dirname, '..', 'THIRD_PARTY_LICENSES.md'), 'utf8'));
  });

  it('does not serve files outside the public folder', async () => {
    assert.equal((await req('GET', '/..%2Fserver.js')).status, 403);
    assert.equal((await req('GET', '/server.js')).status, 404);
  });

  it('only allows GET outside the API', async () => {
    assert.equal((await req('POST', '/', {})).status, 405);
  });

  it('answers 404 for unknown API resources', async () => {
    const res = await req('GET', '/api/nothing');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  it('rejects invalid JSON', async () => {
    const res = await req('POST', '/api/projects', '{not json');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Invalid JSON' });
  });
});

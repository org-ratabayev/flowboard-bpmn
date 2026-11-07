// Characterization tests for live collaboration (Server-Sent Events + POST …/live).

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagram, openLive, sleep, startServer } from './helpers/server.mjs';

let server;
let req;
before(async () => {
  server = await startServer();
  req = server.request;
});
after(() => server.stop());

/** A project of Tester that Alice, Bob and Carol may edit. */
const newProject = async (name) => {
  const id = (await req('POST', '/api/projects', { name })).body.id;
  for (const user of ['Alice', 'Bob', 'Carol']) await server.grant(id, user);
  return id;
};
const clientId = () => `client-${Math.random().toString(36).slice(2, 12)}`;

describe('live collaboration', () => {
  it('rejects streams without a valid client id', async () => {
    const id = await newProject('Bad client');
    for (const query of ['', '?client=short', '?client=has%20space%20inside']) {
      const res = await fetch(`${server.base}/api/projects/${id}/live${query}`, { headers: { Cookie: await server.signIn('Tester') } });
      assert.equal(res.status, 400);
      assert.equal(await res.text(), 'Bad client id');
    }
  });

  it('answers 404 for unknown projects and 405 for other methods', async () => {
    assert.equal((await fetch(`${server.base}/api/projects/missing/live?client=${clientId()}`, { headers: { Cookie: await server.signIn('Tester') } })).status, 404);
    const id = await newProject('Methods');
    assert.equal((await req('PUT', `/api/projects/${id}/live`, {})).status, 405);
  });

  it('greets a new tab and tells the others', async () => {
    const id = await newProject('Greeting');
    const a = await openLive(server, id, clientId(), 'Alice');
    const helloA = await a.next('hello');
    assert.equal(helloA.you.name, 'Alice');
    assert.match(helloA.you.color, /^#[0-9a-f]{6}$/);
    assert.equal(helloA.rev, 0);
    assert.equal(helloA.savedRev, 0);
    assert.equal(helloA.xml, null);
    assert.deepEqual(helloA.participants.map((p) => p.name), ['Alice']);

    const guestId = clientId();
    const guest = await openLive(server, id, guestId, 'Bob');
    const helloGuest = await guest.next('hello');
    assert.equal(helloGuest.you.name, 'Bob');
    assert.notEqual(helloGuest.you.color, helloA.you.color);

    const presence = await a.next('presence', (d) => d.participants.length === 2);
    const guestEntry = presence.participants.find((p) => p.id === guestId);
    assert.deepEqual(Object.keys(guestEntry).sort(), ['color', 'cursor', 'id', 'name', 'selection', 'status']);
    assert.equal(guestEntry.status, 'viewing');
    a.close();
    guest.close();
  });

  it('shares unsaved changes and marks the project dirty', async () => {
    const id = await newProject('Sharing');
    const aId = clientId();
    const a = await openLive(server, id, aId, 'Alice');
    const b = await openLive(server, id, clientId(), 'Bob');
    await b.next('hello');

    const xml = diagram('Unsaved');
    const posted = await a.post({ type: 'doc', xml });
    assert.equal(posted.status, 200);
    assert.deepEqual(posted.body, { rev: 1 });

    const doc = await b.next('doc');
    assert.deepEqual(doc, { rev: 1, xml, dirty: true, by: { id: aId, name: 'Alice' } });
    const presence = await b.next('presence', (d) => d.participants.some((p) => p.id === aId && p.status === 'editing'));
    assert.ok(presence);

    const project = await req('GET', `/api/projects/${id}`);
    assert.equal(project.body.xml, xml);
    assert.equal(project.body.rev, 1);
    assert.equal(project.body.dirty, true);
    a.close();
    b.close();
  });

  it('broadcasts saves and clears the dirty flag', async () => {
    const id = await newProject('Saving live');
    const aId = clientId();
    const a = await openLive(server, id, aId, 'Alice');
    const b = await openLive(server, id, clientId(), 'Bob');
    await b.next('hello');
    await a.post({ type: 'doc', xml: diagram('Draft') });

    const baseVersion = (await req('GET', `/api/projects/${id}`)).body.version;
    const xml = diagram('Saved');
    const saved = await server.as('Alice')('PUT', `/api/projects/${id}`, { xml, baseVersion, client: aId });
    assert.equal(saved.body.rev, 2);

    const event = await b.next('saved');
    assert.deepEqual(event, { rev: 2, version: saved.body.version, xml, author: 'Alice', by: aId });
    const project = await req('GET', `/api/projects/${id}`);
    assert.equal(project.body.dirty, false);
    assert.equal(project.body.rev, 2);
    a.close();
    b.close();
  });

  it('relays cursors and presence', async () => {
    const id = await newProject('Presence');
    const aId = clientId();
    const a = await openLive(server, id, aId, 'Alice');
    const b = await openLive(server, id, clientId(), 'Bob');
    await b.next('hello');

    await a.post({ type: 'cursor', cursor: { x: 10, y: 20 } });
    assert.deepEqual(await b.next('cursor'), { id: aId, cursor: { x: 10, y: 20 } });
    await a.post({ type: 'cursor', cursor: { x: 'left', y: 1 } });
    assert.deepEqual(await b.next('cursor'), { id: aId, cursor: null });

    const find = (status) => (d) => d.participants.some((p) => p.id === aId && p.status === status);
    // names come from the signed-in user; a name sent by the client is ignored
    await a.post({ type: 'presence', name: 'Mallory', selection: ['Activity_1', 42] });
    const selected = await b.next('presence', (d) => d.participants.some((p) => p.id === aId && p.selection.length));
    assert.deepEqual(selected.participants.find((p) => p.id === aId), {
      ...selected.participants.find((p) => p.id === aId), name: 'Alice', selection: ['Activity_1']
    });
    await a.post({ type: 'presence', viewing: '2000-01-01T00-00-00-000Z' });
    assert.ok(await b.next('presence', find('viewing-old')));
    await a.post({ type: 'presence', active: false });
    assert.ok(await b.next('presence', find('away')));
    a.close();
    b.close();
  });

  it('validates live messages', async () => {
    const id = await newProject('Validation');
    const a = await openLive(server, id, clientId(), 'Alice');
    await a.next('hello');

    const unknown = await req('POST', `/api/projects/${id}/live`, { client: clientId(), type: 'cursor' });
    assert.equal(unknown.status, 404);
    assert.deepEqual(unknown.body, { error: 'Not connected' });
    const badType = await a.post({ type: 'shout' });
    assert.equal(badType.status, 400);
    assert.deepEqual(badType.body, { error: 'Unknown message type' });
    const badDoc = await a.post({ type: 'doc', xml: '<html/>' });
    assert.equal(badDoc.status, 400);
    assert.deepEqual(badDoc.body, { error: 'Not a BPMN diagram' });
    a.close();
  });

  it('keeps an unsaved draft after everyone leaves', async () => {
    const id = await newProject('Draft kept');
    const a = await openLive(server, id, clientId(), 'Alice');
    await a.next('hello');
    const xml = diagram('Left behind');
    await a.post({ type: 'doc', xml });
    a.close();
    await sleep(200);

    const project = await req('GET', `/api/projects/${id}`);
    assert.equal(project.body.xml, xml);
    assert.equal(project.body.dirty, true);

    const c = await openLive(server, id, clientId(), 'Carol');
    const hello = await c.next('hello');
    assert.equal(hello.xml, xml);
    assert.equal(hello.rev, 1);
    c.close();
  });

  it('forgets a clean room after everyone leaves', async () => {
    const id = await newProject('Clean room');
    const a = await openLive(server, id, clientId(), 'Alice');
    await a.next('hello');
    const baseVersion = (await req('GET', `/api/projects/${id}`)).body.version;
    await req('PUT', `/api/projects/${id}`, { xml: diagram('Saved'), baseVersion });
    a.close();
    await sleep(200);

    const project = await req('GET', `/api/projects/${id}`);
    assert.equal(project.body.rev, 0);
    assert.equal(project.body.dirty, false);
  });
});

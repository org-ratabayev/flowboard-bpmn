// Role changes reach people who have the project open, without a reload.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagram, openLive, sleep, startServer } from './helpers/server.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server.stop());

const owner = () => server.as('Olivia');
let n = 0;
const client = () => `client-roles-${++n}-xxxx`;
const newProject = async (name) => (await owner()('POST', '/api/projects', { name, xml: diagram() })).body.id;
const userId = async (name) => (await server.as(name)('GET', '/api/me')).body.id;
/** Resolves true when `promise` settles within `ms`. */
const settles = (promise, ms = 1500) => Promise.race([promise.then(() => true), sleep(ms).then(() => false)]);

describe('live role changes', () => {
  it('tells the person whose role changed, and only them', async () => {
    const id = await newProject('Roles');
    await server.grant(id, 'Vera', 'viewer', 'Olivia');
    const vera = await openLive(server, id, client(), 'Vera');
    const olivia = await openLive(server, id, client(), 'Olivia');
    assert.equal((await vera.next('hello')).you.role, 'viewer');
    assert.equal((await olivia.next('hello')).you.role, 'owner');

    await server.grant(id, 'Vera', 'editor', 'Olivia');
    assert.deepEqual(await vera.next('access'), { role: 'editor' });
    assert.equal((await vera.post({ type: 'doc', xml: diagram('Now editing') })).status, 200);

    await server.grant(id, 'Vera', 'viewer', 'Olivia');
    assert.deepEqual(await vera.next('access'), { role: 'viewer' });
    assert.equal((await vera.post({ type: 'doc', xml: diagram('Not anymore') })).status, 403);

    await assert.rejects(olivia.next('access', () => true, 300), /No "access" event/);
    vera.close();
    olivia.close();
  });

  it('disconnects people whose access is removed and tells the others', async () => {
    const id = await newProject('Removal');
    await server.grant(id, 'Rita', 'editor', 'Olivia');
    const olivia = await openLive(server, id, client(), 'Olivia');
    await olivia.next('hello');
    const rita = await openLive(server, id, client(), 'Rita');
    await rita.next('hello');
    await olivia.next('presence', (d) => d.participants.length === 2);

    const ritaId = await userId('Rita');
    assert.equal((await owner()('DELETE', `/api/projects/${id}/access/members/${ritaId}`)).status, 204);
    await rita.next('access-revoked');
    assert.ok(await settles(rita.ended), 'the stream ends');
    await olivia.next('presence', (d) => d.participants.length === 1);
    olivia.close();
  });

  it('removes people who could only view because the project was open to everyone', async () => {
    const id = await newProject('Everyone');
    await owner()('PATCH', `/api/projects/${id}/access`, { visibility: 'everyone' });
    const sam = await openLive(server, id, client(), 'Sam');
    assert.equal((await sam.next('hello')).you.role, 'viewer');
    await owner()('PATCH', `/api/projects/${id}/access`, { visibility: 'private' });
    await sam.next('access-revoked');
    assert.ok(await settles(sam.ended));
  });

  it('removes people who joined through a revoked link', async () => {
    const id = await newProject('Link');
    const link = (await owner()('POST', `/api/projects/${id}/access/links`, { role: 'editor', expiresInDays: 1 })).body;
    await server.as('Lin')('POST', '/api/share/join', { token: link.token });
    const lin = await openLive(server, id, client(), 'Lin');
    assert.equal((await lin.next('hello')).you.role, 'editor');
    await owner()('DELETE', `/api/projects/${id}/access/links/${link.id}`);
    await lin.next('access-revoked');
  });

  it('closes all tabs of someone who leaves a project', async () => {
    const id = await newProject('Leaving');
    const leoId = await server.grant(id, 'Leo', 'viewer', 'Olivia');
    const tab1 = await openLive(server, id, client(), 'Leo');
    const tab2 = await openLive(server, id, client(), 'Leo');
    await tab1.next('hello');
    await tab2.next('hello');
    await server.as('Leo')('DELETE', `/api/projects/${id}/access/members/${leoId}`);
    await tab1.next('access-revoked');
    await tab2.next('access-revoked');
  });

  it('raises the role of open tabs when someone joins through a link', async () => {
    const id = await newProject('Raise');
    await server.grant(id, 'Ray', 'viewer', 'Olivia');
    const ray = await openLive(server, id, client(), 'Ray');
    await ray.next('hello');
    const link = (await owner()('POST', `/api/projects/${id}/access/links`, { role: 'editor', expiresInDays: 1 })).body;
    await server.as('Ray')('POST', '/api/share/join', { token: link.token });
    assert.deepEqual(await ray.next('access'), { role: 'editor' });
    ray.close();
  });
});

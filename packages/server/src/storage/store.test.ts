// Contract tests: the same expectations for every storage backend.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_DIAGRAM } from '../bpmn.ts';
import { createAuthStore } from '../auth/authStore.ts';
import { createAccessStore } from './accessStore.ts';
import { migrate } from './migrations.ts';
import type { DocumentStore } from './sqlStore.ts';
import { backends } from './testBackends.ts';

const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/;
const xml = (label: string) => `<bpmn:definitions id="D"><bpmn:process id="P"><bpmn:task name="${label}"/></bpmn:process></bpmn:definitions>`;

describe.each(backends)('$name store', (backend) => {
  let store: DocumentStore;
  let cleanup: () => Promise<void>;
  beforeEach(async () => ({ store, cleanup } = await backend.open()));
  afterEach(() => cleanup());

  it('applies migrations once', async () => {
    expect(await migrate(store.db)).toEqual([]);
  });

  it('creates projects with unique ids and a first version', async () => {
    expect(await store.createProject('Order Flow!', xml('A'), 'Alice')).toBe('order-flow');
    expect(await store.createProject('Order Flow!', undefined, null)).toBe('order-flow-2');
    expect(await store.hasProject('order-flow')).toBe(true);
    expect(await store.hasProject('missing')).toBe(false);
    expect(await store.hasProject('Bad_ID')).toBe(false);
    expect(await store.countProjects()).toBe(2);

    expect(await store.readLatest('order-flow')).toBe(xml('A'));
    expect(await store.readLatest('order-flow-2')).toBe(EMPTY_DIAGRAM);
    const [v] = await store.listVersions('order-flow');
    expect(v).toMatchObject({ author: 'Alice', note: 'Created', size: Buffer.byteLength(xml('A')) });
    expect(v.version).toMatch(VERSION_RE);
    expect(await store.currentVersion('order-flow')).toBe(v.version);
    expect(await store.readVersion('order-flow', v.version)).toBe(xml('A'));
    expect(await store.readVersion('order-flow', '2000-01-01T00-00-00-000Z')).toBeNull();

    const meta = await store.readMeta('order-flow');
    expect(meta.name).toBe('Order Flow!');
    expect(Date.parse(meta.createdAt!)).not.toBeNaN();
  });

  it('lists projects newest first with summary fields', async () => {
    await store.createProject('One', xml('1'), 'Alice');
    await new Promise((r) => setTimeout(r, 5));
    await store.createProject('Two', xml('2'), 'Bob');
    const list = await store.listProjects();
    expect(list.map((p) => p.id)).toEqual(['two', 'one']);
    expect(list[0]).toMatchObject({ name: 'Two', updatedBy: 'Bob', versionCount: 1 });
    expect(Date.parse(list[0].updatedAt)).not.toBeNaN();
  });

  it('saves versions on top of the latest one and refuses outdated ones', async () => {
    const id = await store.createProject('Saves', xml('1'), null);
    const base = (await store.currentVersion(id))!;
    const first = await store.saveVersion(id, xml('2'), { baseVersion: base, author: 'Bob', note: 'Second' });
    expect('saved' in first).toBe(true);
    const conflict = await store.saveVersion(id, xml('3'), { baseVersion: base });
    expect(conflict).toEqual({ conflict: expect.objectContaining({ author: 'Bob', note: 'Second' }) });
    expect('saved' in (await store.saveVersion(id, xml('3'), { baseVersion: 'old', force: true }))).toBe(true);

    const versions = await store.listVersions(id);
    expect(versions.map((v) => v.note)).toEqual([null, 'Second', 'Created']);
    expect(new Set(versions.map((v) => v.version)).size).toBe(3);
    expect(await store.readLatest(id)).toBe(xml('3'));
    expect((await store.listProjects())[0].versionCount).toBe(3);
  });

  it('lets only one of two concurrent saves on the same base win', async () => {
    const id = await store.createProject('Race', xml('1'), null);
    const base = await store.currentVersion(id);
    const results = await Promise.all([
      store.saveVersion(id, xml('a'), { baseVersion: base }),
      store.saveVersion(id, xml('b'), { baseVersion: base })
    ]);
    expect(results.filter((r) => 'saved' in r)).toHaveLength(1);
    expect(results.filter((r) => 'conflict' in r)).toHaveLength(1);
    expect(await store.listVersions(id)).toHaveLength(2);
  });

  it('gives versions saved in the same millisecond distinct names', async () => {
    const id = await store.createProject('Fast', xml('1'), null);
    await Promise.all([1, 2, 3].map((n) => store.saveVersion(id, xml(String(n)), { force: true })));
    const names = (await store.listVersions(id)).map((v) => v.version);
    expect(new Set(names).size).toBe(4);
    names.forEach((n) => expect(n).toMatch(VERSION_RE));
  });

  it('renames, including to an empty name as before', async () => {
    const id = await store.createProject('Old', xml('1'), null);
    expect((await store.renameProject(id, 'New')).name).toBe('New');
    expect((await store.renameProject(id, undefined)).name).toBe('New');
    expect((await store.renameProject(id, '')).name).toBe('');
    expect((await store.listProjects())[0].name).toBe(id);
  });

  it('gives projects without an owner to the first user who signed in', async () => {
    const access = createAccessStore(store.db);
    await store.createProject('Before users', xml('1'), null, null);
    expect(await access.adoptUnowned()).toBe(0); // nobody to give it to yet
    const auth = createAuthStore(store.db);
    const first = await auth.upsertUser({ provider: 'dev', subject: 'first', name: 'First', email: null });
    expect(await access.roleOf(first.id, 'before-users')).toBe('owner'); // adopted when the first user appeared
    const second = await auth.upsertUser({ provider: 'dev', subject: 'second', name: 'Second', email: null });
    expect(await access.roleOf(second.id, 'before-users')).toBe('none');
    // "first" is the user recorded first, not whoever has the smallest timestamp (ties, clock changes)
    await store.db.transaction((q) => q.run('UPDATE users SET created_at = $2 WHERE id = $1', [second.id, '2000-01-01T00:00:00.000Z']));

    await store.importProject({ id: 'later', name: 'Later', createdAt: null, importKey: 'folder:later', versions: [] });
    expect(await access.roleOf(first.id, 'later')).toBe('owner');
    expect(await store.listProjects(second.id)).toEqual([]);
    expect((await store.listProjects()).map((p) => p.id).sort()).toEqual(['before-users', 'later']);
  });

  it('stops new joins through an expired link but keeps those who joined', async () => {
    const access = createAccessStore(store.db);
    const auth = createAuthStore(store.db);
    const owner = await auth.upsertUser({ provider: 'dev', subject: 'o', name: 'O', email: null });
    const early = await auth.upsertUser({ provider: 'dev', subject: 'e', name: 'E', email: null });
    const late = await auth.upsertUser({ provider: 'dev', subject: 'l', name: 'L', email: null });
    await store.createProject('Expiring', xml('1'), 'O', owner.id);
    const link = await access.createLink('expiring', 'viewer', 1, owner.id);
    expect(await access.joinByLink(link.token, early.id)).toEqual({ documentId: 'expiring', role: 'viewer' });
    await store.db.transaction((q) => q.run('UPDATE share_links SET expires_at = $2 WHERE id = $1', [link.id, '2000-01-01T00:00:00.000Z']));
    expect(await access.joinByLink(link.token, late.id)).toBe('expired');
    expect(await access.roleOf(early.id, 'expiring')).toBe('viewer');
  });

  it('never lowers a role when accepting an invitation', async () => {
    const access = createAccessStore(store.db);
    const auth = createAuthStore(store.db);
    const owner = await auth.upsertUser({ provider: 'dev', subject: 'o', name: 'O', email: null });
    const user = await auth.upsertUser({ provider: 'trusted-headers', subject: 'u', name: 'U', email: null });
    await store.createProject('Invited', xml('1'), 'O', owner.id);
    await access.grant('invited', user.id, 'editor', owner.id);
    expect(await access.invite('invited', 'u@example.com', 'viewer', owner.id)).toBe('invited'); // no user has this email yet
    await auth.upsertUser({ provider: 'trusted-headers', subject: 'u', name: 'U', email: 'U@example.com' });
    expect(await access.roleOf(user.id, 'invited')).toBe('editor');
    expect((await access.access('invited', { forOwner: true })).invites).toEqual([]);
  });

  it('imports a project with its history once', async () => {
    await store.createProject('Taken', xml('x'), null);
    const project = {
      id: 'taken',
      name: 'Imported',
      createdAt: '2026-01-01T10:00:00.000Z',
      importKey: 'folder:taken',
      versions: [
        { name: '2026-01-01T10-00-00-000Z', at: '2026-01-01T10:00:00.000Z', xml: xml('v1'), author: 'Ann', note: 'Created' },
        { name: '2026-01-02T10-00-00-000Z', at: '2026-01-02T10:00:00.000Z', xml: xml('v2'), author: null, note: null }
      ]
    };
    expect(await store.importProject(project)).toEqual({ id: 'taken-2', status: 'imported' });
    expect(await store.importProject(project)).toEqual({ id: 'taken-2', status: 'skipped' });

    const versions = await store.listVersions('taken-2');
    expect(versions.map((v) => [v.version, v.at, v.author])).toEqual([
      ['2026-01-02T10-00-00-000Z', '2026-01-02T10:00:00.000Z', null],
      ['2026-01-01T10-00-00-000Z', '2026-01-01T10:00:00.000Z', 'Ann']
    ]);
    expect(await store.readMeta('taken-2')).toEqual({ name: 'Imported', createdAt: '2026-01-01T10:00:00.000Z' });
    const listed = (await store.listProjects()).find((p) => p.id === 'taken-2')!;
    expect(listed.updatedAt).toBe('2026-01-02T10:00:00.000Z');

    // Saving on top of imported history continues the sequence.
    const saved = await store.saveVersion('taken-2', xml('v3'), { baseVersion: '2026-01-02T10-00-00-000Z' });
    expect('saved' in saved).toBe(true);
    expect(await store.readLatest('taken-2')).toBe(xml('v3'));
  });
});

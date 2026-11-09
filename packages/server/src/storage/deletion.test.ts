// Deleting projects on every backend: a soft delete hides the project from every query that reaches it
// and keeps its data for an admin restore; a permanent delete removes everything keyed to it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthStore } from '../auth/authStore.ts';
import { createConversationStore } from '../chat/conversationStore.ts';
import type { Identity } from '../auth/index.ts';
import { createAccessStore, type AccessStore } from './accessStore.ts';
import type { DocumentStore } from './sqlStore.ts';
import { backends } from './testBackends.ts';

const xml = (label: string) => `<bpmn:definitions id="D"><bpmn:process id="P"><bpmn:task name="${label}"/></bpmn:process></bpmn:definitions>`;

/** Rows keyed to the project in every table that holds project data. */
async function rowsOf(store: DocumentStore, id: string): Promise<Record<string, number>> {
  const count = (sql: string) => store.db.read(async (q) => Number((await q.get<{ n: unknown }>(sql, [id]))!.n));
  const conversations = 'SELECT id FROM chat_conversations WHERE document_id = $1';
  return {
    documents: await count('SELECT COUNT(*) AS n FROM documents WHERE id = $1'),
    versions: await count('SELECT COUNT(*) AS n FROM document_versions WHERE document_id = $1'),
    grants: await count('SELECT COUNT(*) AS n FROM document_grants WHERE document_id = $1'),
    invites: await count('SELECT COUNT(*) AS n FROM pending_grants WHERE document_id = $1'),
    links: await count('SELECT COUNT(*) AS n FROM share_links WHERE document_id = $1'),
    audit: await count('SELECT COUNT(*) AS n FROM audit_log WHERE document_id = $1'),
    conversations: await count('SELECT COUNT(*) AS n FROM chat_conversations WHERE document_id = $1'),
    messages: await count(`SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id IN (${conversations})`),
    turns: await count(`SELECT COUNT(*) AS n FROM chat_turns WHERE conversation_id IN (${conversations})`),
    toolCalls: await count(`SELECT COUNT(*) AS n FROM chat_tool_calls WHERE conversation_id IN (${conversations})`)
  };
}

describe.each(backends)('$name project deletion', (backend) => {
  let store: DocumentStore;
  let access: AccessStore;
  let cleanup: () => Promise<void>;
  let owner: Identity;
  let editor: Identity;
  let id: string;
  let linkToken: string;

  beforeEach(async () => {
    ({ store, cleanup } = await backend.open());
    access = createAccessStore(store.db);
    const auth = createAuthStore(store.db);
    owner = await auth.upsertUser({ provider: 'dev', subject: 'o', name: 'Owner', email: null });
    editor = await auth.upsertUser({ provider: 'dev', subject: 'e', name: 'Editor', email: null });
    id = await store.createProject('Doomed', xml('1'), 'Owner', owner.id);
    await store.saveVersion(id, xml('2'), { force: true, author: 'Owner', authorId: owner.id });
    await access.grant(id, editor.id, 'editor', owner.id);
    await access.invite(id, 'later@example.com', 'viewer', owner.id);
    linkToken = (await access.createLink(id, 'viewer', null, owner.id)).token;

    const chat = createConversationStore(store.db);
    const conversation = await chat.create(editor.id, id, { providerId: 'p', model: 'm', title: 'About it' });
    const started = await chat.startTurn(conversation.id, editor.id, { maxActive: 3, staleBefore: new Date(0).toISOString() });
    if (!('turn' in started)) throw new Error('turn did not start');
    await chat.appendMessage(conversation.id, started.turn.id, 'user', [{ type: 'text', text: 'hello' }]);
    await chat.addToolCall({ turnId: started.turn.id, conversationId: conversation.id, id: 'call-1', name: 'bpmn_get_xml', input: {}, status: 'pending' });
  });
  afterEach(() => cleanup());

  it('soft delete hides the project everywhere, keeps its data and stops running chat turns', async () => {
    const before = await rowsOf(store, id);
    const result = await store.deleteProject(id, owner.id);
    expect(result!.stopConversations).toHaveLength(1);
    expect(await store.deleteProject(id, owner.id)).toBeNull(); // already deleted

    expect(await access.roleOf(owner.id, id)).toBe('none');
    expect(await access.roleOf(editor.id, id)).toBe('none');
    expect(await store.hasProject(id)).toBe(false);
    expect(await store.listProjects(owner.id)).toEqual([]);
    expect(await store.listProjects(editor.id)).toEqual([]);
    expect(await store.listProjects()).toEqual([]); // CLI export
    expect(await store.countProjects()).toBe(1); // still there: no import on first start
    const other = await createAuthStore(store.db).upsertUser({ provider: 'dev', subject: 'x', name: 'X', email: null });
    expect(await access.joinByLink(linkToken, other.id)).toBe('deleted');
    expect(await access.roleOf(other.id, id)).toBe('none');

    // nothing removed; one more audit entry; the running turn is asked to stop
    expect(await rowsOf(store, id)).toEqual({ ...before, audit: before.audit + 1 });
    const turn = await store.db.read((q) => q.get<{ cancel_requested: unknown }>('SELECT cancel_requested FROM chat_turns'));
    expect(Number(turn!.cancel_requested)).toBe(1);
    const [entry] = await access.log(id, 1);
    expect(entry).toMatchObject({ action: 'project.delete', actor: { id: owner.id }, details: { name: 'Doomed' } });
  });

  it('keeps invitations to a deleted project pending until it is restored', async () => {
    await store.deleteProject(id, owner.id);
    const auth = createAuthStore(store.db);
    const later = await auth.upsertUser({ provider: 'oidc', subject: 'l', name: 'Later', email: 'later@example.com' });
    expect(await access.roleOf(later.id, id)).toBe('none');
    expect((await rowsOf(store, id)).invites).toBe(1);

    const [deleted] = await store.listDeletedProjects();
    expect(deleted).toMatchObject({ id, name: 'Doomed', deletedBy: { id: owner.id, name: 'Owner' }, owner: { id: owner.id, name: 'Owner' }, versionCount: 2 });
    expect(Date.parse(deleted.deletedAt)).not.toBeNaN();

    expect(await store.restoreProject(id)).toBe(true);
    expect(await store.restoreProject(id)).toBe(false);
    expect(await store.listDeletedProjects()).toEqual([]);
    expect(await access.roleOf(owner.id, id)).toBe('owner');
    expect(await access.roleOf(editor.id, id)).toBe('editor');
    await auth.upsertUser({ provider: 'oidc', subject: 'l', name: 'Later', email: 'later@example.com' }); // signs in again
    expect(await access.roleOf(later.id, id)).toBe('viewer');
    expect((await access.log(id, 5)).map((e) => e.action)).toContain('project.restore');
  });

  it('permanent delete removes every row keyed to the project and logs only that it happened', async () => {
    const result = await store.purgeProject(id, owner.id);
    expect(result!.stopConversations).toHaveLength(1);
    expect(await rowsOf(store, id)).toEqual({
      documents: 0, versions: 0, grants: 0, invites: 0, links: 0, audit: 0, conversations: 0, messages: 0, turns: 0, toolCalls: 0
    });
    expect(await store.purgeProject(id, owner.id)).toBeNull();
    const rows = await store.db.read((q) => q.all<{ document_id: string | null; actor_id: string; details: string }>(
      `SELECT document_id, actor_id, details FROM audit_log WHERE action = 'project.purge'`
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0].document_id).toBeNull();
    expect(rows[0].actor_id).toBe(owner.id);
    expect(JSON.parse(rows[0].details)).toEqual({ projectId: id, versions: 2, conversations: 1, wasDeleted: false, via: 'app' });
    expect(rows[0].details).not.toMatch(/Doomed/);

    // the id is free again, and a new project with it starts with a clean log
    expect(await store.createProject('Doomed', xml('new'), 'Owner', owner.id)).toBe(id);
    expect((await access.log(id)).map((e) => e.action)).toEqual(['project.create']);
  });

  it('purges from the admin CLI only projects that were deleted', async () => {
    expect(await store.purgeProject(id, null, { onlyDeleted: true, via: 'cli' })).toBeNull();
    expect(await store.hasProject(id)).toBe(true);
    await store.deleteProject(id, owner.id);
    expect(await store.purgeProject(id, null, { onlyDeleted: true, via: 'cli' })).not.toBeNull();
    expect((await rowsOf(store, id)).documents).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalEvents, type EventBus } from '../events.ts';
import type { LlmEvent, LlmProvider, StreamRequest } from '../llm/types.ts';
import { LlmError } from '../llm/types.ts';
import type { Role } from '../storage/accessStore.ts';
import type { Db } from '../storage/db.ts';
import { migrate } from '../storage/migrations.ts';
import { openSqlite } from '../storage/sqliteDb.ts';
import { runTurn, TOOL_TIMEOUT_RESULT, type TurnEvent } from './agentLoop.ts';
import { createConversationStore, type ConversationStore } from './conversationStore.ts';

type Reply = (request: StreamRequest) => LlmEvent[] | AsyncIterable<LlmEvent>;

/** A provider that plays back one scripted reply per call and records what it was sent. */
function scriptedProvider(replies: Reply[]) {
  const requests: StreamRequest[] = [];
  const provider: LlmProvider = {
    async *stream(request) {
      requests.push(structuredClone({ ...request, signal: undefined }));
      const reply = replies.shift();
      if (!reply) throw new Error('no scripted reply left');
      yield* reply(request);
    },
    listModels: async () => []
  };
  return { provider, requests };
}

const say = (text: string): Reply => () => [
  { type: 'text', text },
  { type: 'usage', inputTokens: 10, outputTokens: 5 },
  { type: 'done', stopReason: 'end' }
];
const callTool = (id: string, name: string, input: unknown = {}): Reply => () => [
  { type: 'text', text: 'Let me look.' },
  { type: 'tool_call', id, name, input },
  { type: 'usage', inputTokens: 20, outputTokens: 7 },
  { type: 'done', stopReason: 'tool_use' }
];
/** Streams one word, then waits until the request is aborted (like a slow model). */
const hang: Reply = (request) => (async function* () {
  yield { type: 'text', text: 'Thinking' } as LlmEvent;
  await new Promise((_, reject) => request.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
})();

const toolNames = (request: StreamRequest) => request.tools.map((t) => t.name);
const until = async (check: () => boolean | Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};

let db: Db;
let store: ConversationStore;
let bus: EventBus;
let role: Role;
let conversationId: string;

beforeEach(async () => {
  db = openSqlite(':memory:');
  await migrate(db);
  const at = new Date().toISOString();
  await db.transaction(async (q) => {
    await q.run(`INSERT INTO users (id, provider, subject, name, created_at, last_seen_at) VALUES ('u1', 'dev', 'ann', 'Ann', $1, $1)`, [at]);
    await q.run(`INSERT INTO documents (id, name, updated_at, owner_id) VALUES ('doc', 'Doc', $1, 'u1')`, [at]);
  });
  store = createConversationStore(db);
  bus = createLocalEvents();
  role = 'editor';
  conversationId = (await store.create('u1', 'doc', { providerId: 'p', model: 'm', title: 't' })).id;
});

afterEach(async () => {
  await db.close();
});

/** Starts a turn for `prompt` and runs it; `browser` plays the editor answering tool requests. */
async function turn(provider: LlmProvider, prompt: string, options: {
  browser?: (event: Extract<TurnEvent, { type: 'tool_request' }>) => Promise<void> | void;
  signal?: AbortSignal;
  toolTimeoutMs?: number;
  maxIterations?: number;
  pollMs?: number;
  apiKey?: string;
} = {}) {
  const started = await store.startTurn(conversationId, 'u1', { maxActive: 8, staleBefore: new Date(0).toISOString() });
  if (!('turn' in started)) throw new Error('busy');
  await store.appendMessage(conversationId, started.turn.id, 'user', [{ type: 'text', text: prompt }]);
  const events: TurnEvent[] = [];
  const outcome = await runTurn({
    store,
    bus,
    provider,
    credentials: { apiKey: options.apiKey ?? 'sk-test-secret-1234' },
    model: 'm',
    system: 'system prompt',
    conversationId,
    turnId: started.turn.id,
    roleOf: async () => role,
    emit: (event) => {
      events.push(event);
      if (event.type === 'tool_request' && options.browser) void options.browser(event);
    },
    signal: options.signal ?? new AbortController().signal,
    limits: { maxIterations: options.maxIterations ?? 20, toolTimeoutMs: options.toolTimeoutMs ?? 3000, pollMs: options.pollMs ?? 1000 }
  });
  return { outcome, events, turn: (await store.getTurn(started.turn.id))! };
}

/** The browser's side: store the answer and wake the turn, like POST …/tool-results does. */
async function answer(event: { turnId: string; id: string }, content: string, isError = false) {
  expect(await store.answerToolCall(conversationId, event.turnId, event.id, content, isError)).toBe('ok');
  await bus.publish('chat', conversationId);
}

describe('agent loop', () => {
  it('streams a plain answer and stores it with its usage', async () => {
    const { provider, requests } = scriptedProvider([say('Hello there')]);
    const { outcome, events, turn: t } = await turn(provider, 'Hi');
    expect(outcome).toBe('done');
    expect(events).toEqual([
      { type: 'text', text: 'Hello there' },
      { type: 'usage', inputTokens: 10, outputTokens: 5 },
      { type: 'done', stopReason: 'end', usage: { inputTokens: 10, outputTokens: 5 } }
    ]);
    expect(requests[0].system).toBe('system prompt');
    expect(requests[0].messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }]);
    expect(t).toMatchObject({ status: 'done', stopReason: 'end', usage: { inputTokens: 10, outputTokens: 5 } });
    const stored = await store.messages(conversationId);
    expect(stored.map((m) => [m.role, m.content])).toEqual([
      ['user', [{ type: 'text', text: 'Hi' }]],
      ['assistant', [{ type: 'text', text: 'Hello there' }]]
    ]);
    expect(stored[1].usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('runs a browser tool and gives its result to the model', async () => {
    const { provider, requests } = scriptedProvider([callTool('call-1', 'bpmn_get_summary'), say('It has one task.')]);
    const { outcome, events } = await turn(provider, 'What is in it?', { browser: (e) => answer(e, '{"tasks":1}') });
    expect(outcome).toBe('done');
    const request = events.find((e) => e.type === 'tool_request');
    expect(request).toMatchObject({ id: 'call-1', name: 'bpmn_get_summary', input: {} });
    expect(events).toContainEqual({ type: 'tool_result', id: 'call-1', name: 'bpmn_get_summary', status: 'done' });
    expect(requests[1].messages.slice(1)).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', id: 'call-1', name: 'bpmn_get_summary', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 'call-1', content: '{"tasks":1}' }] }
    ]);
    expect((await store.toolCalls((request as { turnId: string }).turnId))[0]).toMatchObject({ status: 'done', result: '{"tasks":1}' });
  });

  it('passes errors reported by the browser to the model', async () => {
    const { provider, requests } = scriptedProvider([callTool('c', 'bpmn_get_elements', { ids: ['X'] }), say('No such element.')]);
    await turn(provider, 'Show X', { browser: (e) => answer(e, 'Unknown element X', true) });
    expect(requests[1].messages.at(-1)!.content).toEqual([{ type: 'tool_result', toolUseId: 'c', content: 'Unknown element X', isError: true }]);
  });

  it('offers viewers only read tools and refuses edit tools even when the model calls them', async () => {
    role = 'viewer';
    const { provider, requests } = scriptedProvider([callTool('c', 'bpmn_delete_elements', { ids: ['A'] }), say('I cannot change it.')]);
    const { outcome, events } = await turn(provider, 'Delete A', { browser: () => { throw new Error('must not reach the browser'); } });
    expect(outcome).toBe('done');
    expect(toolNames(requests[0])).toEqual(['bpmn_get_summary', 'bpmn_get_elements', 'bpmn_get_xml', 'bpmn_lint', 'bpmn_export_svg']);
    expect(events.some((e) => e.type === 'tool_request')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_result', id: 'c', status: 'refused' }));
    const result = requests[1].messages.at(-1)!.content[0];
    expect(result).toMatchObject({ type: 'tool_result', toolUseId: 'c', isError: true });
    expect((result as { content: string }).content).toMatch(/needs edit access/);
  });

  it('refuses unknown tools', async () => {
    const { provider, requests } = scriptedProvider([callTool('c', 'shell_exec', { cmd: 'ls' }), say('ok')]);
    await turn(provider, 'Run ls');
    expect(requests[1].messages.at(-1)!.content[0]).toMatchObject({ isError: true, content: 'Unknown tool: shell_exec' });
  });

  it('applies a role change in the middle of a turn', async () => {
    const { provider, requests } = scriptedProvider([
      callTool('c1', 'bpmn_add_elements', { elements: [{ type: 'bpmn:Task' }] }),
      callTool('c2', 'bpmn_add_elements', { elements: [{ type: 'bpmn:Task' }] }),
      say('Done as far as allowed.')
    ]);
    const asked: string[] = [];
    const { outcome } = await turn(provider, 'Add two tasks', {
      browser: async (e) => {
        asked.push(e.id);
        role = 'viewer'; // the owner downgrades the user while the first edit runs
        await answer(e, 'added');
      }
    });
    expect(outcome).toBe('done');
    expect(asked).toEqual(['c1']);
    expect(toolNames(requests[0])).toContain('bpmn_add_elements');
    expect(toolNames(requests[1])).not.toContain('bpmn_add_elements');
    expect(requests[2].messages.at(-1)!.content[0]).toMatchObject({ toolUseId: 'c2', isError: true });
  });

  it('stops when the user lost access', async () => {
    const { provider } = scriptedProvider([callTool('c1', 'bpmn_get_summary'), say('never')]);
    const { outcome, events, turn: t } = await turn(provider, 'Hi', { browser: async (e) => { role = 'none'; await answer(e, '{}'); } });
    expect(outcome).toBe('failed');
    expect(events.at(-1)).toEqual({ type: 'error', message: 'You no longer have access to this diagram' });
    expect(t.status).toBe('failed');
  });

  it('tells the model when the browser does not answer in time', async () => {
    const { provider, requests } = scriptedProvider([callTool('c', 'bpmn_get_summary'), say('The editor seems closed.')]);
    const { outcome, events, turn: t } = await turn(provider, 'Hi', { toolTimeoutMs: 150, pollMs: 50 });
    expect(outcome).toBe('done');
    expect(events).toContainEqual({ type: 'tool_result', id: 'c', name: 'bpmn_get_summary', status: 'timeout' });
    expect(requests[1].messages.at(-1)!.content).toEqual([{ type: 'tool_result', toolUseId: 'c', content: TOOL_TIMEOUT_RESULT, isError: true }]);
    // a late answer is refused
    expect(await store.answerToolCall(conversationId, t.id, 'c', 'late', false)).toBe('closed');
  });

  it('stops after the iteration limit', async () => {
    const { provider, requests } = scriptedProvider([callTool('a', 'bpmn_lint'), callTool('b', 'bpmn_lint'), callTool('c', 'bpmn_lint')]);
    const { outcome, events, turn: t } = await turn(provider, 'Lint forever', { maxIterations: 2, browser: (e) => answer(e, 'ok') });
    expect(outcome).toBe('done');
    expect(requests).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'max_iterations' });
    expect(t.stopReason).toBe('max_iterations');
  });

  it('is cancelled from any instance through the database and the bus', async () => {
    const { provider } = scriptedProvider([hang]);
    const running = turn(provider, 'Hi', { pollMs: 60_000 });
    let turnId = '';
    await until(async () => { turnId = (await store.turns(conversationId)).at(-1)?.id ?? ''; return !!turnId && (await store.messages(conversationId)).length > 0; });
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.requestCancel(conversationId, turnId)).toBe(true);
    await bus.publish('chat', conversationId);
    const { outcome, events, turn: t } = await running;
    expect(outcome).toBe('cancelled');
    expect(events.at(-1)).toEqual({ type: 'cancelled' });
    expect(t.status).toBe('cancelled');
    // the words streamed so far are kept
    expect((await store.messages(conversationId)).at(-1)!.content).toEqual([{ type: 'text', text: 'Thinking' }]);
  });

  it('is cancelled when the browser disconnects, also while waiting for a tool', async () => {
    const { provider, requests } = scriptedProvider([callTool('c', 'bpmn_get_summary'), say('never')]);
    const disconnect = new AbortController();
    const { outcome, turn: t } = await turn(provider, 'Hi', { signal: disconnect.signal, browser: () => { disconnect.abort(); } });
    expect(outcome).toBe('cancelled');
    expect(requests).toHaveLength(1);
    expect(t.status).toBe('cancelled');
    expect((await store.toolCalls(t.id))[0].status).toBe('timeout');
  });

  it('continues the conversation in the next turn, with a placeholder for unanswered tool calls', async () => {
    const disconnect = new AbortController();
    await turn(scriptedProvider([callTool('c', 'bpmn_get_summary')]).provider, 'First', { signal: disconnect.signal, browser: () => { disconnect.abort(); } });
    const { provider, requests } = scriptedProvider([say('Second answer')]);
    expect((await turn(provider, 'Second')).outcome).toBe('done');
    expect(requests[0].messages.map((m) => [m.role, m.content.map((b) => b.type)])).toEqual([
      ['user', ['text']],
      ['assistant', ['text', 'tool_use']],
      ['user', ['tool_result', 'text']]
    ]);
  });

  it('reports provider errors without the credentials in them', async () => {
    const key = 'sk-test-very-secret-9876';
    const provider: LlmProvider = {
      // eslint-disable-next-line require-yield
      async *stream() { throw new LlmError(`Anthropic API: invalid key ${key}`, 401); },
      listModels: async () => []
    };
    const { outcome, events, turn: t } = await turn(provider, 'Hi', { apiKey: key });
    expect(outcome).toBe('failed');
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Anthropic API: invalid key [redacted]' });
    expect(t.error).toBe('Anthropic API: invalid key [redacted]');
  });
});

describe('turn bookkeeping', () => {
  const longAgo = () => new Date(Date.now() - 3600_000).toISOString();

  it('allows one running turn per conversation and a limited number per user', async () => {
    const other = (await store.create('u1', 'doc', { providerId: 'p', model: 'm', title: '' })).id;
    const third = (await store.create('u1', 'doc', { providerId: 'p', model: 'm', title: '' })).id;
    const options = { maxActive: 2, staleBefore: longAgo() };
    expect('turn' in await store.startTurn(conversationId, 'u1', options)).toBe(true);
    expect(await store.startTurn(conversationId, 'u1', options)).toEqual({ busy: 'conversation' });
    expect('turn' in await store.startTurn(other, 'u1', options)).toBe(true);
    expect(await store.startTurn(third, 'u1', options)).toEqual({ busy: 'user' });
  });

  it('fails turns whose server stopped sending heartbeats', async () => {
    const started = await store.startTurn(conversationId, 'u1', { maxActive: 8, staleBefore: longAgo() });
    if (!('turn' in started)) throw new Error('busy');
    await store.addToolCall({ turnId: started.turn.id, conversationId, id: 'c', name: 'bpmn_lint', input: {}, status: 'pending' });
    expect(await store.failStaleTurns(longAgo())).toBe(0);
    // a later start in the same conversation treats the silent turn as dead
    const again = await store.startTurn(conversationId, 'u1', { maxActive: 8, staleBefore: new Date(Date.now() + 1000).toISOString() });
    expect('turn' in again).toBe(true);
    expect(await store.getTurn(started.turn.id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/stopped/) });
    expect((await store.toolCalls(started.turn.id))[0].status).toBe('timeout');
  });

  it('deletes idle conversations, but not while a turn runs', async () => {
    const idle = (await store.create('u1', 'doc', { providerId: 'p', model: 'm', title: '' })).id;
    await store.startTurn(conversationId, 'u1', { maxActive: 8, staleBefore: longAgo() });
    expect(await store.deleteIdle(new Date(Date.now() + 1000).toISOString())).toBe(1);
    expect(await store.get('u1', 'doc', idle)).toBeNull();
    expect(await store.get('u1', 'doc', conversationId)).not.toBeNull();
  });

  it('keeps conversations private to their user', async () => {
    expect(await store.get('someone-else', 'doc', conversationId)).toBeNull();
    expect(await store.get('u1', 'other-doc', conversationId)).toBeNull();
    expect(await store.list('someone-else', 'doc')).toEqual([]);
  });
});

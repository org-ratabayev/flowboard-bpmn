// Two server instances on one Postgres database: the turn runs on instance A, the browser's tool
// result arrives at instance B. B stores it and sends NOTIFY; A wakes up and continues.
//
// PGlite runs a single session, so it cannot hold the extra LISTEN connections; the LISTEN side is
// a small hub that hands every NOTIFY sent through the database to both instances' listeners,
// the way Postgres would. The queries themselves (including pg_notify) run on real Postgres.

import { afterEach, beforeEach, expect, it } from 'vitest';
import { createPostgresEvents, type EventBus, type ListenerClient } from '../events.ts';
import type { LlmEvent, LlmProvider, StreamRequest } from '../llm/types.ts';
import type { Db } from '../storage/db.ts';
import { backends } from '../storage/testBackends.ts';
import { runTurn, type TurnEvent } from './agentLoop.ts';
import { createConversationStore } from './conversationStore.ts';

function notifyHub() {
  const listeners = new Set<(msg: { channel: string; payload: string }) => void>();
  return {
    deliver(channel: string, payload: string) { for (const l of listeners) l({ channel, payload }); },
    client(): ListenerClient {
      let handler: ((msg: { channel: string; payload: string }) => void) | null = null;
      const client = {
        connect: async () => {},
        query: async () => {},
        on(event: string, fn: (msg: { channel: string; payload: string }) => void) {
          if (event === 'notification') { handler = fn; listeners.add(fn); }
          return client;
        },
        end: async () => { if (handler) listeners.delete(handler); }
      };
      return client as unknown as ListenerClient;
    }
  };
}

/** The shared database, with every pg_notify also handed to the hub after it ran. */
function notifying(db: Db, hub: ReturnType<typeof notifyHub>): Db {
  return {
    ...db,
    read: (fn) => db.read((q) => fn({
      ...q,
      async get(sql: string, params?: unknown[]) {
        const row = await q.get(sql, params);
        if (sql.includes('pg_notify')) hub.deliver(params![0] as string, params![1] as string);
        return row as never;
      }
    }))
  };
}

let cleanup: () => Promise<void>;
let db: Db;
let busA: EventBus;
let busB: EventBus;

beforeEach(async () => {
  const opened = await backends.find((b) => b.name === 'postgres')!.open();
  cleanup = opened.cleanup;
  const hub = notifyHub();
  db = notifying(opened.store.db, hub);
  busA = createPostgresEvents(db, { connectionString: 'unused', listen: true, createClient: hub.client });
  busB = createPostgresEvents(db, { connectionString: 'unused', listen: true, createClient: hub.client });
  const at = new Date().toISOString();
  await db.transaction(async (q) => {
    await q.run(`INSERT INTO users (id, provider, subject, name, created_at, last_seen_at) VALUES ('u1', 'dev', 'ann', 'Ann', $1, $1)`, [at]);
    await q.run(`INSERT INTO documents (id, name, updated_at, owner_id) VALUES ('doc', 'Doc', $1, 'u1')`, [at]);
  });
});

afterEach(async () => {
  await busA.close();
  await busB.close();
  await cleanup();
});

it('continues a turn on one instance when the tool result reaches another', async () => {
  const storeA = createConversationStore(db);
  const storeB = createConversationStore(db);
  const conversation = await storeA.create('u1', 'doc', { providerId: 'p', model: 'm', title: '' });
  const started = await storeA.startTurn(conversation.id, 'u1', { maxActive: 8, staleBefore: new Date(0).toISOString() });
  if (!('turn' in started)) throw new Error('busy');
  await storeA.appendMessage(conversation.id, started.turn.id, 'user', [{ type: 'text', text: 'What is in it?' }]);

  const requests: StreamRequest[] = [];
  const replies: LlmEvent[][] = [
    [{ type: 'tool_call', id: 'call-1', name: 'bpmn_get_summary', input: {} }, { type: 'done', stopReason: 'tool_use' }],
    [{ type: 'text', text: 'One task.' }, { type: 'done', stopReason: 'end' }]
  ];
  const provider: LlmProvider = {
    async *stream(request) { requests.push(request); yield* replies.shift()!; },
    listModels: async () => []
  };

  const events: TurnEvent[] = [];
  const startedAt = Date.now();
  const outcome = await runTurn({
    store: storeA,
    bus: busA,
    provider,
    credentials: {},
    model: 'm',
    system: '',
    conversationId: conversation.id,
    turnId: started.turn.id,
    roleOf: async () => 'editor',
    emit: (event) => {
      events.push(event);
      if (event.type === 'tool_request') {
        // the browser's POST lands on instance B
        void (async () => {
          expect(await storeB.answerToolCall(conversation.id, event.turnId, event.id, '{"tasks":1}', false)).toBe('ok');
          await busB.publish('chat', conversation.id);
        })();
      }
    },
    signal: new AbortController().signal,
    // polling is far slower than the test: only the notification can wake instance A in time
    limits: { maxIterations: 5, toolTimeoutMs: 20_000, pollMs: 15_000 }
  });

  expect(outcome).toBe('done');
  expect(Date.now() - startedAt).toBeLessThan(5000);
  expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'end' });
  expect(requests[1].messages.at(-1)!.content).toEqual([{ type: 'tool_result', toolUseId: 'call-1', content: '{"tasks":1}' }]);
  expect((await storeB.getTurn(started.turn.id))!.status).toBe('done');
});

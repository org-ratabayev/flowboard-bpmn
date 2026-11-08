// Chat history in the database, so that any server instance can run the next turn of a
// conversation and any instance can accept a tool result from the browser.
//
//   conversation  one user, one document, one provider and model; deleted after idling for a while
//   message       provider-independent content blocks (text, tool_use, tool_result) in order
//   turn          one prompt and the model's work on it: running → done | failed | cancelled
//   tool call     a browser tool call of a turn, waiting for (or holding) the browser's answer

import crypto from 'node:crypto';
import { toIso, type Db, type Queryable } from '../storage/db.ts';
import type { ContentBlock } from '../llm/types.ts';

export interface Conversation {
  id: string;
  documentId: string;
  providerId: string;
  model: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  seq: number;
  turnId: string | null;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  usage: { inputTokens: number; outputTokens: number } | null;
  createdAt: string;
}

export type TurnStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface Turn {
  id: string;
  conversationId: string;
  status: TurnStatus;
  stopReason: string | null;
  error: string | null;
  usage: { inputTokens: number; outputTokens: number };
  cancelRequested: boolean;
  startedAt: string;
  finishedAt: string | null;
}

export type ToolCallStatus = 'pending' | 'done' | 'error' | 'timeout';

export interface ToolCall {
  turnId: string;
  id: string;
  name: string;
  input: unknown;
  status: ToolCallStatus;
  result: string | null;
}

export type StartTurnResult =
  | { turn: Turn }
  | { busy: 'conversation' | 'user' }
  /** Too many turns started in the last minute; `retryAfterSeconds` until the next one may start. */
  | { busy: 'rate'; retryAfterSeconds: number };

export const STALE_TURN_ERROR = 'The server running this turn stopped before it finished';

const now = () => new Date().toISOString();

const conversationOf = (r: Record<string, unknown>): Conversation => ({
  id: r.id as string,
  documentId: r.document_id as string,
  providerId: r.provider_id as string,
  model: r.model as string,
  title: r.title as string,
  createdAt: toIso(r.created_at)!,
  updatedAt: toIso(r.updated_at)!
});

const turnOf = (r: Record<string, unknown>): Turn => ({
  id: r.id as string,
  conversationId: r.conversation_id as string,
  status: r.status as TurnStatus,
  stopReason: (r.stop_reason as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  usage: { inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens) },
  cancelRequested: Number(r.cancel_requested) === 1,
  startedAt: toIso(r.started_at)!,
  finishedAt: toIso(r.finished_at)
});

/** Postgres reports 23505; SQLite a UNIQUE constraint message. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === '23505' || /UNIQUE constraint failed/i.test(e?.message ?? '');
}

async function failStale(q: Queryable, staleBefore: string, userId?: string): Promise<number> {
  const stale = userId
    ? await q.all<{ id: string }>(`SELECT id FROM chat_turns WHERE status = 'running' AND heartbeat_at < $1 AND user_id = $2`, [staleBefore, userId])
    : await q.all<{ id: string }>(`SELECT id FROM chat_turns WHERE status = 'running' AND heartbeat_at < $1`, [staleBefore]);
  const at = now();
  for (const { id } of stale) {
    await q.run(`UPDATE chat_turns SET status = 'failed', error = $2, finished_at = $3 WHERE id = $1 AND status = 'running'`, [id, STALE_TURN_ERROR, at]);
    await q.run(`UPDATE chat_tool_calls SET status = 'timeout', finished_at = $2 WHERE turn_id = $1 AND status = 'pending'`, [id, at]);
  }
  return stale.length;
}

export type ConversationStore = ReturnType<typeof createConversationStore>;

export function createConversationStore(db: Db) {
  const touch = (q: Queryable, conversationId: string, at: string) =>
    q.run('UPDATE chat_conversations SET updated_at = $2 WHERE id = $1', [conversationId, at]);

  return {
    async create(userId: string, documentId: string, fields: { providerId: string; model: string; title: string }): Promise<Conversation> {
      const conversation: Conversation = { id: crypto.randomUUID(), documentId, ...fields, createdAt: now(), updatedAt: now() };
      await db.transaction((q) => q.run(
        `INSERT INTO chat_conversations (id, user_id, document_id, provider_id, model, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [conversation.id, userId, documentId, fields.providerId, fields.model, fields.title, conversation.createdAt, conversation.updatedAt]
      ));
      return conversation;
    },

    /** The user's conversations about a document, most recently active first. */
    list(userId: string, documentId: string): Promise<Conversation[]> {
      return db.read(async (q) => (await q.all(
        'SELECT * FROM chat_conversations WHERE user_id = $1 AND document_id = $2 ORDER BY updated_at DESC, id',
        [userId, documentId]
      )).map(conversationOf));
    },

    /** A conversation, only when it belongs to this user and document. */
    get(userId: string, documentId: string, id: string): Promise<Conversation | null> {
      return db.read(async (q) => {
        const row = await q.get('SELECT * FROM chat_conversations WHERE id = $1 AND user_id = $2 AND document_id = $3', [id, userId, documentId]);
        return row ? conversationOf(row) : null;
      });
    },

    update(id: string, fields: Partial<Pick<Conversation, 'title' | 'providerId' | 'model'>>): Promise<void> {
      return db.transaction(async (q) => {
        if (fields.title !== undefined) await q.run('UPDATE chat_conversations SET title = $2 WHERE id = $1', [id, fields.title]);
        if (fields.providerId !== undefined) await q.run('UPDATE chat_conversations SET provider_id = $2 WHERE id = $1', [id, fields.providerId]);
        if (fields.model !== undefined) await q.run('UPDATE chat_conversations SET model = $2 WHERE id = $1', [id, fields.model]);
      });
    },

    remove(id: string): Promise<boolean> {
      return db.transaction(async (q) => (await q.run('DELETE FROM chat_conversations WHERE id = $1', [id])).changes > 0);
    },

    messages(conversationId: string): Promise<StoredMessage[]> {
      return db.read(async (q) => (await q.all<Record<string, unknown>>(
        'SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY seq', [conversationId]
      )).map((r) => ({
        seq: Number(r.seq),
        turnId: (r.turn_id as string | null) ?? null,
        role: r.role as 'user' | 'assistant',
        content: JSON.parse(r.content as string) as ContentBlock[],
        usage: r.input_tokens === null || r.input_tokens === undefined
          ? null
          : { inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens) },
        createdAt: toIso(r.created_at)!
      })));
    },

    appendMessage(
      conversationId: string,
      turnId: string | null,
      role: 'user' | 'assistant',
      content: ContentBlock[],
      usage?: { inputTokens: number; outputTokens: number }
    ): Promise<number> {
      return db.transaction(async (q) => {
        const at = now();
        const last = await q.get<{ seq: unknown }>('SELECT MAX(seq) AS seq FROM chat_messages WHERE conversation_id = $1', [conversationId]);
        const seq = Number(last?.seq ?? 0) + 1;
        await q.run(
          `INSERT INTO chat_messages (conversation_id, seq, turn_id, role, content, input_tokens, output_tokens, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [conversationId, seq, turnId, role, JSON.stringify(content), usage?.inputTokens ?? null, usage?.outputTokens ?? null, at]
        );
        if (usage && turnId) {
          await q.run('UPDATE chat_turns SET input_tokens = input_tokens + $2, output_tokens = output_tokens + $3 WHERE id = $1',
            [turnId, usage.inputTokens, usage.outputTokens]);
        }
        await touch(q, conversationId, at);
        return seq;
      });
    },

    /** The latest turns of a conversation, oldest first. */
    turns(conversationId: string, limit = 50): Promise<Turn[]> {
      return db.read(async (q) => (await q.all(
        'SELECT * FROM chat_turns WHERE conversation_id = $1 ORDER BY started_at DESC, id LIMIT $2', [conversationId, limit]
      )).map(turnOf).reverse());
    },

    getTurn(turnId: string): Promise<Turn | null> {
      return db.read(async (q) => {
        const row = await q.get('SELECT * FROM chat_turns WHERE id = $1', [turnId]);
        return row ? turnOf(row) : null;
      });
    },

    /**
     * Starts a turn unless the conversation already has one running, or the user has `maxActive`
     * running turns. Turns whose server stopped sending heartbeats before `staleBefore` are failed first.
     */
    /** `perMinute` limits the turns one user starts per minute (0 or unset: no limit). */
    async startTurn(conversationId: string, userId: string, options: { maxActive: number; staleBefore: string; perMinute?: number }): Promise<StartTurnResult> {
      try {
        return await db.transaction(async (q): Promise<StartTurnResult> => {
          await failStale(q, options.staleBefore, userId);
          const running = await q.get(`SELECT id FROM chat_turns WHERE conversation_id = $1 AND status = 'running'`, [conversationId]);
          if (running) return { busy: 'conversation' };
          const active = await q.get<{ n: unknown }>(`SELECT COUNT(*) AS n FROM chat_turns WHERE user_id = $1 AND status = 'running'`, [userId]);
          if (Number(active?.n ?? 0) >= options.maxActive) return { busy: 'user' };
          if (options.perMinute) {
            const windowStart = new Date(Date.now() - 60_000).toISOString();
            const recent = await q.all<{ started_at: unknown }>(
              'SELECT started_at FROM chat_turns WHERE user_id = $1 AND started_at > $2 ORDER BY started_at',
              [userId, windowStart]
            );
            if (recent.length >= options.perMinute) {
              const oldest = new Date(toIso(recent[recent.length - options.perMinute].started_at)!).getTime();
              return { busy: 'rate', retryAfterSeconds: Math.max(1, Math.ceil((oldest + 60_000 - Date.now()) / 1000)) };
            }
          }
          const at = now();
          const id = crypto.randomUUID();
          await q.run(
            `INSERT INTO chat_turns (id, conversation_id, user_id, status, started_at, heartbeat_at) VALUES ($1, $2, $3, 'running', $4, $4)`,
            [id, conversationId, userId, at]
          );
          await touch(q, conversationId, at);
          return { turn: turnOf((await q.get('SELECT * FROM chat_turns WHERE id = $1', [id]))!) };
        });
      } catch (err) {
        if (isUniqueViolation(err)) return { busy: 'conversation' }; // another instance started one at the same moment
        throw err;
      }
    },

    /** Shows the turn is still being worked on (see `failStaleTurns`). */
    heartbeat(turnId: string): Promise<void> {
      return db.transaction(async (q) => {
        await q.run(`UPDATE chat_turns SET heartbeat_at = $2 WHERE id = $1 AND status = 'running'`, [turnId, now()]);
      });
    },

    /** Ends a running turn; false when it was no longer running. */
    finishTurn(turnId: string, status: Exclude<TurnStatus, 'running'>, details: { stopReason?: string; error?: string } = {}): Promise<boolean> {
      return db.transaction(async (q) => {
        const at = now();
        const changed = (await q.run(
          `UPDATE chat_turns SET status = $2, stop_reason = $3, error = $4, finished_at = $5 WHERE id = $1 AND status = 'running'`,
          [turnId, status, details.stopReason ?? null, details.error ?? null, at]
        )).changes > 0;
        await q.run(`UPDATE chat_tool_calls SET status = 'timeout', finished_at = $2 WHERE turn_id = $1 AND status = 'pending'`, [turnId, at]);
        return changed;
      });
    },

    /** Asks the instance running the turn to stop it; false when no such turn is running. */
    requestCancel(conversationId: string, turnId: string): Promise<boolean> {
      return db.transaction(async (q) => (await q.run(
        `UPDATE chat_turns SET cancel_requested = 1 WHERE id = $1 AND conversation_id = $2 AND status = 'running'`, [turnId, conversationId]
      )).changes > 0);
    },

    /** Records a tool call: `pending` waits for the browser; refused calls are stored with their error at once. */
    addToolCall(call: { turnId: string; conversationId: string; id: string; name: string; input: unknown; status: 'pending' | 'error'; result?: string }): Promise<void> {
      return db.transaction(async (q) => {
        const at = now();
        await q.run(
          `INSERT INTO chat_tool_calls (turn_id, id, conversation_id, name, input, status, result, created_at, finished_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [call.turnId, call.id, call.conversationId, call.name, JSON.stringify(call.input ?? {}), call.status, call.result ?? null, at, call.status === 'pending' ? null : at]
        );
      });
    },

    toolCalls(turnId: string): Promise<ToolCall[]> {
      return db.read(async (q) => (await q.all<Record<string, unknown>>(
        'SELECT turn_id, id, name, input, status, result FROM chat_tool_calls WHERE turn_id = $1 ORDER BY created_at, id', [turnId]
      )).map((r) => ({
        turnId: r.turn_id as string,
        id: r.id as string,
        name: r.name as string,
        input: JSON.parse(r.input as string),
        status: r.status as ToolCallStatus,
        result: (r.result as string | null) ?? null
      })));
    },

    /** The browser's answer to a pending tool call. */
    answerToolCall(conversationId: string, turnId: string, toolCallId: string, content: string, isError: boolean): Promise<'ok' | 'unknown' | 'closed'> {
      return db.transaction(async (q) => {
        const row = await q.get<{ status: string }>(
          'SELECT status FROM chat_tool_calls WHERE turn_id = $1 AND id = $2 AND conversation_id = $3', [turnId, toolCallId, conversationId]
        );
        if (!row) return 'unknown';
        const changed = (await q.run(
          `UPDATE chat_tool_calls SET status = $3, result = $4, finished_at = $5 WHERE turn_id = $1 AND id = $2 AND status = 'pending'`,
          [turnId, toolCallId, isError ? 'error' : 'done', content, now()]
        )).changes;
        return changed ? 'ok' : 'closed';
      });
    },

    /** Gives up waiting for a tool call; false when its answer arrived first. */
    timeOutToolCall(turnId: string, toolCallId: string): Promise<boolean> {
      return db.transaction(async (q) => (await q.run(
        `UPDATE chat_tool_calls SET status = 'timeout', finished_at = $3 WHERE turn_id = $1 AND id = $2 AND status = 'pending'`,
        [turnId, toolCallId, now()]
      )).changes > 0);
    },

    /** Fails running turns whose server stopped sending heartbeats (it crashed or was killed). */
    failStaleTurns(staleBefore: string): Promise<number> {
      return db.transaction((q) => failStale(q, staleBefore));
    },

    /** Deletes conversations without activity since `before` (never one with a running turn). */
    deleteIdle(before: string): Promise<number> {
      return db.transaction(async (q) => (await q.run(
        `DELETE FROM chat_conversations WHERE updated_at < $1
         AND NOT EXISTS (SELECT 1 FROM chat_turns t WHERE t.conversation_id = chat_conversations.id AND t.status = 'running')`,
        [before]
      )).changes);
    }
  };
}

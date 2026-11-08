// /api/projects/:id/chat/…  Chat with the AI providers of the catalog, one conversation per user and
// document. Everyone with at least view access may chat; what the assistant may do follows their role.
//
//   GET    conversations                       the user's conversations about this document
//   POST   conversations { providerId?, model?, title? }
//   GET    conversations/:cid                  conversation, messages and latest turns
//   PATCH  conversations/:cid { title?, providerId?, model? }
//   DELETE conversations/:cid                  (stops a running turn)
//   POST   conversations/:cid/turns { message }   runs one turn; the response is an event stream
//   POST   conversations/:cid/tool-results { turnId, toolCallId, content, isError? }
//   POST   conversations/:cid/turns/:tid/cancel
//
// A turn runs on the instance that received its request; tool results and cancels may arrive at
// any instance (they go through the database and the event bus).

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Identity } from '../auth/index.ts';
import { parseCookies } from '../auth/requestChecks.ts';
import type { EventBus } from '../events.ts';
import { readJson, send } from '../http.ts';
import type { LlmCatalog, ProviderEntry } from '../llm/catalog.ts';
import { KEYRING_COOKIE, parseKeyring, type KeyStore } from '../llm/keyStore.ts';
import { redact } from '../llm/routes.ts';
import type { AccessStore } from '../storage/accessStore.ts';
import type { Db } from '../storage/db.ts';
import { runTurn, type AgentLimits, type TurnEvent } from './agentLoop.ts';
import { createConversationStore, type ConversationStore } from './conversationStore.ts';
import { systemPrompt } from './systemPrompt.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODEL_RE = /^[\w.:/@-]{1,100}$/;
const TOOL_CALL_ID_RE = /^[\w.:-]{1,128}$/;
const MAX_PROMPT_BYTES = 64 * 1024;
const MAX_TOOL_RESULT_BYTES = 2 * 1024 * 1024;
const MAX_TITLE = 100;
const STALE_AFTER_MS = 60_000;
const SWEEP_MS = 60_000;
const SSE_KEEPALIVE_MS = 15_000;

export interface AgentChatOptions {
  db: Db;
  bus: EventBus;
  access: AccessStore;
  catalog: LlmCatalog;
  keys: KeyStore | null;
  systemPromptAppend: string;
  maxActiveTurnsPerUser: number;
  idleDays: number;
  limits: AgentLimits;
}

export type AgentChat = ReturnType<typeof createAgentChat>;

/** The chat service of one server instance; `close` stops its housekeeping timer. */
export function createAgentChat(options: AgentChatOptions) {
  const store = createConversationStore(options.db);
  const system = systemPrompt(options.systemPromptAppend);

  // fail turns of crashed instances, forget idle conversations
  const sweep = async () => {
    try {
      await store.failStaleTurns(new Date(Date.now() - STALE_AFTER_MS).toISOString());
      await store.deleteIdle(new Date(Date.now() - options.idleDays * 864e5).toISOString());
    } catch (err) {
      console.error('Chat housekeeping failed:', (err as Error).message);
    }
  };
  const timer = setInterval(sweep, SWEEP_MS);
  timer.unref();

  return { ...options, store, system, sweep, close: () => clearInterval(timer) };
}

interface ChatRequest {
  identity: Identity;
  viaToken: boolean;
  upstreamToken: string | null;
}

function cleanTitle(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
}

/** The provider and model to use, or an error message. */
function pickModel(chat: AgentChat, providerId: unknown, model: unknown): { entry: ProviderEntry; model: string } | { error: string } {
  const entry = providerId === undefined ? chat.catalog.entries[0] : typeof providerId === 'string' ? chat.catalog.get(providerId) : undefined;
  if (!entry) return { error: providerId === undefined ? 'No AI provider is configured on this server' : 'Unknown AI provider' };
  if (model === undefined) {
    const fallback = entry.defaultModel ?? entry.models[0];
    return fallback ? { entry, model: fallback } : { error: `Choose a model for ${entry.label}` };
  }
  if (typeof model !== 'string' || !MODEL_RE.test(model)) return { error: 'Invalid model name' };
  if (entry.models.length && !entry.models.includes(model)) return { error: `${entry.label} does not offer ${model}` };
  return { entry, model };
}

/** Starts an event stream; every event carries a sequence number. */
function eventStream(res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  let seq = 0;
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), SSE_KEEPALIVE_MS);
  return {
    send(event: string, data: unknown) {
      if (!res.writableEnded) res.write(`id: ${++seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      clearInterval(keepAlive);
      if (!res.writableEnded) res.end();
    }
  };
}

async function runTurnRequest(
  chat: AgentChat,
  request: ChatRequest,
  req: IncomingMessage,
  res: ServerResponse,
  documentId: string,
  conversationId: string
): Promise<void> {
  const { store } = chat;
  const userId = request.identity.id;
  const conversation = await store.get(userId, documentId, conversationId);
  if (!conversation) return send(res, 404, { error: 'Conversation not found' });

  const body = await readJson(req, MAX_PROMPT_BYTES * 4);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return send(res, 400, { error: 'Message is empty' });
  if (Buffer.byteLength(message) > MAX_PROMPT_BYTES) return send(res, 413, { error: `Messages are limited to ${MAX_PROMPT_BYTES / 1024} KB` });

  const entry = chat.catalog.get(conversation.providerId);
  if (!entry) return send(res, 409, { error: 'This conversation uses an AI provider that is no longer offered; choose another one', code: 'provider-unavailable' });

  // the user's own key exists only for this request: decrypted with this browser's keyring, never stored
  let userKey: string | null = null;
  if (entry.credentials.from === 'user-key') {
    if (request.viaToken) {
      return send(res, 403, { error: 'Your own AI keys work only in the browser that saved them, not with an access token', code: 'provider-unavailable' });
    }
    const keyring = parseKeyring(parseCookies(req).get(KEYRING_COOKIE));
    userKey = chat.keys && keyring ? await chat.keys.use(userId, entry.id, keyring) : null;
  }
  const resolved = await chat.catalog.resolve(entry, { user: request.identity, upstreamToken: request.upstreamToken, userKey })
    .catch((err: Error) => ({ unavailable: redact(`Could not get credentials: ${err.message}`, userKey, request.upstreamToken) }));
  if ('unavailable' in resolved) return send(res, 409, { error: resolved.unavailable, code: 'provider-unavailable' });

  const started = await store.startTurn(conversationId, userId, {
    maxActive: chat.maxActiveTurnsPerUser,
    staleBefore: new Date(Date.now() - STALE_AFTER_MS).toISOString()
  });
  if ('busy' in started) {
    return started.busy === 'conversation'
      ? send(res, 409, { error: 'The assistant is still answering the previous message', code: 'turn-running' })
      : send(res, 429, { error: `At most ${chat.maxActiveTurnsPerUser} chats can be answered at the same time`, code: 'too-many-turns' });
  }
  const turnId = started.turn.id;
  await store.appendMessage(conversationId, turnId, 'user', [{ type: 'text', text: message }]);
  if (!conversation.title) await store.update(conversationId, { title: cleanTitle(message.split('\n')[0]) || 'Chat' });

  const stream = eventStream(res);
  const disconnected = new AbortController();
  res.on('close', () => disconnected.abort());
  stream.send('turn', { turnId, conversationId });
  try {
    await runTurn({
      store,
      bus: chat.bus,
      provider: chat.catalog.client(entry.id)!,
      credentials: resolved.credentials,
      model: conversation.model,
      system: chat.system,
      conversationId,
      turnId,
      roleOf: () => chat.access.roleOf(userId, documentId),
      emit: (event: TurnEvent) => {
        const { type, ...data } = event;
        stream.send(type, data);
      },
      signal: disconnected.signal,
      limits: chat.limits
    });
  } finally {
    stream.end();
  }
}

export async function handleAgentChat(
  chat: AgentChat,
  request: ChatRequest,
  req: IncomingMessage,
  res: ServerResponse,
  documentId: string,
  rest: string[]
): Promise<void> {
  const { store } = chat;
  const userId = request.identity.id;
  const [kind, conversationId, sub, turnId, action] = rest;
  if (kind !== 'conversations') return send(res, 404, { error: 'Not found' });

  if (rest.length === 1) {
    if (req.method === 'GET') return send(res, 200, await store.list(userId, documentId));
    if (req.method === 'POST') {
      const body = await readJson(req, 4096);
      const picked = pickModel(chat, body.providerId, body.model);
      if ('error' in picked) return send(res, 400, { error: picked.error });
      const conversation = await store.create(userId, documentId, { providerId: picked.entry.id, model: picked.model, title: cleanTitle(body.title) });
      return send(res, 201, conversation);
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  // conversations are private: other users (even the document owner) get 404
  if (!UUID_RE.test(conversationId)) return send(res, 404, { error: 'Conversation not found' });
  const conversation = await store.get(userId, documentId, conversationId);
  if (!conversation) return send(res, 404, { error: 'Conversation not found' });

  if (rest.length === 2) {
    if (req.method === 'GET') {
      const [messages, turns] = await Promise.all([store.messages(conversationId), store.turns(conversationId)]);
      return send(res, 200, { ...conversation, messages, turns });
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req, 4096);
      const changes: { title?: string; providerId?: string; model?: string } = {};
      if (body.title !== undefined) changes.title = cleanTitle(body.title);
      if (body.providerId !== undefined || body.model !== undefined) {
        const picked = pickModel(chat, body.providerId ?? conversation.providerId, body.model ?? (body.providerId === undefined ? conversation.model : undefined));
        if ('error' in picked) return send(res, 400, { error: picked.error });
        changes.providerId = picked.entry.id;
        changes.model = picked.model;
      }
      await store.update(conversationId, changes);
      return send(res, 200, await store.get(userId, documentId, conversationId));
    }
    if (req.method === 'DELETE') {
      await store.remove(conversationId);
      await chat.bus.publish('chat', conversationId); // a running turn notices and stops
      return send(res, 204, '');
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (sub === 'turns' && rest.length === 3 && req.method === 'POST') {
    return runTurnRequest(chat, request, req, res, documentId, conversationId);
  }

  if (sub === 'turns' && rest.length === 5 && action === 'cancel' && req.method === 'POST') {
    if (!UUID_RE.test(turnId) || !(await store.requestCancel(conversationId, turnId))) return send(res, 404, { error: 'No such turn is running' });
    await chat.bus.publish('chat', conversationId);
    return send(res, 202, { cancelling: true });
  }

  if (sub === 'tool-results' && rest.length === 3 && req.method === 'POST') {
    const body = await readJson(req, MAX_TOOL_RESULT_BYTES * 2);
    if (typeof body.turnId !== 'string' || !UUID_RE.test(body.turnId) || typeof body.toolCallId !== 'string' || !TOOL_CALL_ID_RE.test(body.toolCallId)) {
      return send(res, 400, { error: 'turnId and toolCallId are required' });
    }
    if (typeof body.content !== 'string') return send(res, 400, { error: 'content must be a string' });
    if (Buffer.byteLength(body.content) > MAX_TOOL_RESULT_BYTES) return send(res, 413, { error: 'Tool result too large' });
    const result = await store.answerToolCall(conversationId, body.turnId, body.toolCallId, body.content, body.isError === true);
    if (result === 'unknown') return send(res, 404, { error: 'Tool call not found' });
    if (result === 'closed') return send(res, 409, { error: 'This tool call is no longer waiting for a result (it timed out or the turn ended)' });
    await chat.bus.publish('chat', conversationId); // wakes the instance running the turn
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

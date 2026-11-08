// The agent loop of one turn: send the history and the allowed tools to the provider, stream its
// reply, run the tool calls it makes (in the user's browser), add their results, and repeat until
// the model stops or the iteration limit is reached.
//
// Everything a turn produces is stored as it happens, so the next turn can run on any instance.
// Browser tool calls are stored as pending; the browser posts the result to any instance, which
// stores it and publishes a `chat` event. This instance wakes up, re-reads the database, continues.
//
// Safety: the user's role is read again before every provider call and every tool call. Viewers
// get read-only tools, and edit tools are refused when called, even if the model asks for them.

import type { EventBus } from '../events.ts';
import type { Credentials, ContentBlock, LlmProvider, StopReason } from '../llm/types.ts';
import { redact } from '../llm/routes.ts';
import type { Role } from '../storage/accessStore.ts';
import type { ConversationStore, ToolCall } from './conversationStore.ts';
import { toProviderHistory } from './history.ts';
import { conversationSignal } from './signals.ts';
import { toolRefusal, toolsForRole } from './toolSpecs.ts';

export interface AgentLimits {
  /** Provider calls per turn. */
  maxIterations: number;
  /** How long a browser tool call may take. */
  toolTimeoutMs: number;
  /** How often a running turn records a heartbeat and checks the database without being woken. */
  pollMs: number;
}

export type TurnEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_request'; turnId: string; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; name: string; status: ToolCall['status'] | 'refused'; error?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done'; stopReason: StopReason | 'max_iterations'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export interface TurnOptions {
  store: ConversationStore;
  bus: EventBus;
  provider: LlmProvider;
  credentials: Credentials;
  model: string;
  system: string;
  conversationId: string;
  turnId: string;
  /** The user's current role on the document (read on every call, roles change live). */
  roleOf: () => Promise<Role>;
  emit: (event: TurnEvent) => void;
  /** Aborted when the browser disconnects. */
  signal: AbortSignal;
  limits: AgentLimits;
}

export const TOOL_TIMEOUT_RESULT = 'The editor did not answer in time. The diagram may be closed; tell the user.';

const secretsOf = (c: Credentials) => [c.apiKey, c.bearer, ...Object.values(c.headers ?? {})];

/** Runs a started turn to its end and records how it ended. Never throws. */
export async function runTurn(options: TurnOptions): Promise<'done' | 'failed' | 'cancelled'> {
  const { store, provider, conversationId, turnId, emit, limits } = options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();

  // a cancel request (or the conversation being deleted) may arrive at any instance
  const watch = conversationSignal(options.bus, conversationId);
  const waits = conversationSignal(options.bus, conversationId);
  const checkCancelled = async () => {
    const turn = await store.getTurn(turnId).catch(() => undefined);
    if (turn === null || turn?.cancelRequested || (turn && turn.status !== 'running')) abort();
  };
  const watcher = (async () => {
    while (!controller.signal.aborted) {
      await watch.wait(limits.pollMs, controller.signal);
      if (controller.signal.aborted) break;
      await store.heartbeat(turnId).catch(() => {});
      await checkCancelled();
    }
  })();

  const total = { inputTokens: 0, outputTokens: 0 };
  let partial: ContentBlock[] = [];
  try {
    for (let iteration = 0; iteration < limits.maxIterations; iteration++) {
      const role = await options.roleOf();
      if (role === 'none') throw new TurnError('You no longer have access to this diagram');

      const history = toProviderHistory(await store.messages(conversationId));
      partial = [];
      const calls: Array<{ id: string; name: string; input: unknown }> = [];
      let usage = { inputTokens: 0, outputTokens: 0 };
      let stopReason: StopReason = 'other';
      for await (const event of provider.stream({
        model: options.model,
        system: options.system,
        messages: history,
        tools: toolsForRole(role),
        credentials: options.credentials,
        signal: controller.signal
      })) {
        if (event.type === 'text') {
          const last = partial.at(-1);
          if (last?.type === 'text') last.text += event.text;
          else partial.push({ type: 'text', text: event.text });
          emit(event);
        } else if (event.type === 'tool_call') {
          calls.push(event);
          partial.push({ type: 'tool_use', id: event.id, name: event.name, input: event.input });
        } else if (event.type === 'usage') {
          usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens };
        } else if (event.type === 'done') {
          stopReason = event.stopReason;
        }
      }
      if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
      const content = partial;
      partial = [];
      await store.appendMessage(conversationId, turnId, 'assistant', content, usage);
      total.inputTokens += usage.inputTokens;
      total.outputTokens += usage.outputTokens;
      emit({ type: 'usage', ...usage });

      if (!calls.length) {
        await store.finishTurn(turnId, 'done', { stopReason });
        emit({ type: 'done', stopReason, usage: total });
        return 'done';
      }

      const results = await runTools(options, calls, waits, controller.signal);
      if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
      await store.appendMessage(conversationId, turnId, 'user', results);
    }
    await store.finishTurn(turnId, 'done', { stopReason: 'max_iterations' });
    emit({ type: 'done', stopReason: 'max_iterations', usage: total });
    return 'done';
  } catch (err) {
    if (controller.signal.aborted) {
      // keep what the model already wrote; unanswered tool calls get a placeholder result later
      if (partial.length) await store.appendMessage(conversationId, turnId, 'assistant', partial).catch(() => {});
      await store.finishTurn(turnId, 'cancelled').catch(() => {});
      emit({ type: 'cancelled' });
      return 'cancelled';
    }
    const unreachable = err instanceof TypeError && err.message === 'fetch failed';
    const known = err instanceof TurnError || (err as Error)?.name === 'LlmError' || unreachable;
    const message = unreachable
      ? 'Could not reach the AI provider'
      : known ? redact((err as Error).message, ...secretsOf(options.credentials)) : 'Internal error';
    if (!known) console.error('Chat turn failed:', redact(String((err as Error)?.stack ?? err), ...secretsOf(options.credentials)));
    await store.finishTurn(turnId, 'failed', { error: message }).catch(() => {});
    emit({ type: 'error', message });
    return 'failed';
  } finally {
    options.signal.removeEventListener('abort', abort);
    controller.abort();
    watch.close();
    waits.close();
    await watcher;
  }
}

class TurnError extends Error {}

/** Refuses what the user may not run, sends the rest to the browser and waits for the answers. */
async function runTools(
  options: TurnOptions,
  calls: Array<{ id: string; name: string; input: unknown }>,
  waits: ReturnType<typeof conversationSignal>,
  signal: AbortSignal
): Promise<ContentBlock[]> {
  const { store, conversationId, turnId, emit, limits } = options;
  const refused = new Map<string, string>();
  const role = await options.roleOf(); // checked when the tools run, not only when they were offered
  for (const call of calls) {
    const reason = toolRefusal(call.name, role);
    if (reason) {
      refused.set(call.id, reason);
      await store.addToolCall({ turnId, conversationId, ...call, status: 'error', result: reason });
      emit({ type: 'tool_result', id: call.id, name: call.name, status: 'refused', error: reason });
    } else {
      await store.addToolCall({ turnId, conversationId, ...call, status: 'pending' });
      emit({ type: 'tool_request', turnId, id: call.id, name: call.name, input: call.input });
    }
  }

  const deadline = Date.now() + limits.toolTimeoutMs;
  const waitingFor = new Set(calls.filter((c) => !refused.has(c.id)).map((c) => c.id));
  let answered = new Map<string, ToolCall>();
  while (waitingFor.size && !signal.aborted) {
    answered = new Map((await store.toolCalls(turnId)).map((c) => [c.id, c]));
    for (const id of [...waitingFor]) {
      const call = answered.get(id);
      if (call && call.status !== 'pending') {
        waitingFor.delete(id);
        emit({ type: 'tool_result', id, name: call.name, status: call.status });
      }
    }
    if (!waitingFor.size) break;
    const left = deadline - Date.now();
    if (left <= 0) {
      for (const id of waitingFor) await store.timeOutToolCall(turnId, id);
      // an answer may have arrived just before the time-out was stored: it wins
      answered = new Map((await store.toolCalls(turnId)).map((c) => [c.id, c]));
      for (const id of waitingFor) {
        const stored = answered.get(id);
        emit({ type: 'tool_result', id, name: stored?.name ?? '', status: stored?.status ?? 'timeout' });
      }
      waitingFor.clear();
      break;
    }
    await waits.wait(Math.min(left, limits.pollMs), signal);
  }

  return calls.map((call): ContentBlock => {
    const reason = refused.get(call.id);
    if (reason) return { type: 'tool_result', toolUseId: call.id, content: reason, isError: true };
    const stored = answered.get(call.id);
    if (stored?.status === 'done') return { type: 'tool_result', toolUseId: call.id, content: stored.result ?? '' };
    if (stored?.status === 'error') return { type: 'tool_result', toolUseId: call.id, content: stored.result || 'The tool failed', isError: true };
    return { type: 'tool_result', toolUseId: call.id, content: TOOL_TIMEOUT_RESULT, isError: true };
  });
}

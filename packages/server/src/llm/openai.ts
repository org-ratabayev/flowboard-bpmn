// OpenAI-compatible Chat Completions (streaming, with function tools). Works with the OpenAI
// API and with the many gateways and servers that implement the same endpoint.

import { errorText, readSse } from './sse.ts';
import { LlmError, type Credentials, type LlmEvent, type LlmMessage, type LlmProvider, type StopReason, type StreamRequest } from './types.ts';

const STOP: Record<string, StopReason> = { stop: 'end', tool_calls: 'tool_use', function_call: 'tool_use', length: 'max_tokens' };

function authHeaders(credentials: Credentials): Record<string, string> {
  const token = credentials.bearer ?? credentials.apiKey;
  return { ...(token ? { authorization: `Bearer ${token}` } : {}), ...credentials.headers };
}

/** Provider-independent messages → Chat Completions messages (tool results become role "tool" messages). */
export function toChatMessages(system: string, messages: LlmMessage[]) {
  const out: Array<Record<string, unknown>> = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = m.content.filter((b) => b.type === 'tool_use');
      out.push({
        role: 'assistant',
        // some servers reject a null content next to tool calls, so send an empty string instead
        content: text,
        ...(calls.length
          ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) }
          : {})
      });
      continue;
    }
    for (const block of m.content.filter((b) => b.type === 'tool_result')) {
      out.push({ role: 'tool', tool_call_id: block.toolUseId, content: block.isError ? `Error: ${block.content}` : block.content });
    }
    const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

export function createOpenAiCompatibleProvider({ baseUrl }: { baseUrl: string }): LlmProvider {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    async *stream(request: StreamRequest): AsyncGenerator<LlmEvent> {
      const res = await fetch(`${root}/chat/completions`, {
        method: 'POST',
        signal: request.signal,
        headers: { 'content-type': 'application/json', ...authHeaders(request.credentials) },
        body: JSON.stringify({
          model: request.model,
          messages: toChatMessages(request.system, request.messages),
          ...(request.tools.length
            ? { tools: request.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })) }
            : {}),
          stream: true,
          stream_options: { include_usage: true }
        })
      });
      if (!res.ok || !res.body) throw new LlmError(`Chat completions API: ${await errorText(res)}`, res.status);

      // tool calls arrive in pieces, keyed by index: id and name first, then argument fragments
      const calls = new Map<number, { id: string; name: string; args: string }>();
      let stopReason: StopReason = 'other';
      let usage: { inputTokens: number; outputTokens: number } | null = null;

      for await (const { data } of readSse(res.body)) {
        if (data === '[DONE]') break;
        const chunk = JSON.parse(data);
        if (chunk.error) throw new LlmError(`Chat completions API: ${chunk.error.message ?? 'stream error'}`);
        if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 };
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (typeof choice.delta?.content === 'string' && choice.delta.content) yield { type: 'text', text: choice.delta.content };
        for (const part of choice.delta?.tool_calls ?? []) {
          const call = calls.get(part.index) ?? { id: '', name: '', args: '' };
          if (part.id) call.id = part.id;
          if (part.function?.name) call.name += part.function.name;
          if (part.function?.arguments) call.args += part.function.arguments;
          calls.set(part.index, call);
        }
        if (choice.finish_reason) stopReason = STOP[choice.finish_reason] ?? 'other';
      }

      for (const [, call] of [...calls].sort((a, b) => a[0] - b[0])) {
        let input: unknown = {};
        try {
          input = call.args ? JSON.parse(call.args) : {};
        } catch {
          throw new LlmError(`Chat completions API: tool call ${call.name} had invalid JSON arguments`);
        }
        yield { type: 'tool_call', id: call.id, name: call.name, input };
      }
      if (usage) yield { type: 'usage', ...usage };
      yield { type: 'done', stopReason: calls.size && stopReason === 'other' ? 'tool_use' : stopReason };
    },

    async listModels(credentials: Credentials, signal?: AbortSignal): Promise<string[]> {
      const res = await fetch(`${root}/models`, { signal, headers: authHeaders(credentials) });
      if (!res.ok) throw new LlmError(`Models API: ${await errorText(res)}`, res.status);
      const body = await res.json() as { data?: Array<{ id: string }> };
      return (body.data ?? []).map((m) => m.id).sort();
    }
  };
}

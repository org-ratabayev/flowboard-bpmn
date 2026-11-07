// Anthropic Messages API (streaming, with tools). Works with api.anthropic.com and with
// gateways that expose the same API under another base URL.

import { errorText, readSse } from './sse.ts';
import { LlmError, type Credentials, type LlmEvent, type LlmMessage, type LlmProvider, type StopReason, type StreamRequest } from './types.ts';

const API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 8192;

const STOP: Record<string, StopReason> = { end_turn: 'end', stop_sequence: 'end', tool_use: 'tool_use', max_tokens: 'max_tokens' };

function authHeaders(credentials: Credentials): Record<string, string> {
  return {
    ...(credentials.apiKey ? { 'x-api-key': credentials.apiKey } : {}),
    ...(credentials.bearer ? { authorization: `Bearer ${credentials.bearer}` } : {}),
    ...credentials.headers
  };
}

function toApiMessages(messages: LlmMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((block) => {
      if (block.type === 'text') return { type: 'text', text: block.text };
      if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      return { type: 'tool_result', tool_use_id: block.toolUseId, content: block.content, ...(block.isError ? { is_error: true } : {}) };
    })
  }));
}

export function createAnthropicProvider({ baseUrl = 'https://api.anthropic.com' }: { baseUrl?: string } = {}): LlmProvider {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    async *stream(request: StreamRequest): AsyncGenerator<LlmEvent> {
      const res = await fetch(`${root}/v1/messages`, {
        method: 'POST',
        signal: request.signal,
        headers: { 'content-type': 'application/json', 'anthropic-version': API_VERSION, ...authHeaders(request.credentials) },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: request.system,
          messages: toApiMessages(request.messages),
          tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
          stream: true
        })
      });
      if (!res.ok || !res.body) throw new LlmError(`Anthropic API: ${await errorText(res)}`, res.status);

      // tool_use blocks arrive as a start event plus partial JSON deltas, keyed by block index
      const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
      let inputTokens = 0;
      let outputTokens = 0;
      let stopReason: StopReason = 'other';

      for await (const { data } of readSse(res.body)) {
        const message = JSON.parse(data);
        switch (message.type) {
          case 'message_start':
            inputTokens = message.message?.usage?.input_tokens ?? 0;
            break;
          case 'content_block_start':
            if (message.content_block?.type === 'tool_use') {
              toolBlocks.set(message.index, { id: message.content_block.id, name: message.content_block.name, json: '' });
            }
            break;
          case 'content_block_delta':
            if (message.delta?.type === 'text_delta') yield { type: 'text', text: message.delta.text };
            else if (message.delta?.type === 'input_json_delta') {
              const block = toolBlocks.get(message.index);
              if (block) block.json += message.delta.partial_json;
            }
            break;
          case 'content_block_stop': {
            const block = toolBlocks.get(message.index);
            if (block) {
              toolBlocks.delete(message.index);
              let input: unknown = {};
              try {
                input = block.json ? JSON.parse(block.json) : {};
              } catch {
                throw new LlmError(`Anthropic API: tool call ${block.name} had invalid JSON input`);
              }
              yield { type: 'tool_call', id: block.id, name: block.name, input };
            }
            break;
          }
          case 'message_delta':
            if (message.delta?.stop_reason) stopReason = STOP[message.delta.stop_reason] ?? 'other';
            if (message.usage?.output_tokens !== undefined) outputTokens = message.usage.output_tokens;
            break;
          case 'error':
            throw new LlmError(`Anthropic API: ${message.error?.message ?? 'stream error'}`);
          default:
            break; // ping, message_stop
        }
      }
      yield { type: 'usage', inputTokens, outputTokens };
      yield { type: 'done', stopReason };
    },

    async listModels(credentials: Credentials, signal?: AbortSignal): Promise<string[]> {
      const res = await fetch(`${root}/v1/models?limit=100`, {
        signal,
        headers: { 'anthropic-version': API_VERSION, ...authHeaders(credentials) }
      });
      if (!res.ok) throw new LlmError(`Anthropic API: ${await errorText(res)}`, res.status);
      const body = await res.json() as { data?: Array<{ id: string }> };
      return (body.data ?? []).map((m) => m.id);
    }
  };
}

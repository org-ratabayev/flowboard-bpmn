// A provider-neutral way to talk to chat models with tools. Messages use content blocks
// (text, tool calls, tool results); each provider converts them to its own API.

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the tool input. */
  inputSchema: Record<string, unknown>;
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'other';

export type LlmEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  /** `costUsd` only from providers that report what a call cost. */
  | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number }
  | { type: 'done'; stopReason: StopReason };

/**
 * What a request is authenticated with. Providers put an `apiKey` where their API expects one
 * and a `bearer` token into `Authorization`; `headers` are added as they are.
 * Never log or return these values.
 */
export interface Credentials {
  apiKey?: string;
  bearer?: string;
  headers?: Record<string, string>;
}

export interface StreamRequest {
  model: string;
  system: string;
  messages: LlmMessage[];
  tools: ToolSpec[];
  credentials: Credentials;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  /** One assistant turn: streams text and tool calls until the model stops. */
  stream(request: StreamRequest): AsyncIterable<LlmEvent>;
  /** Models the credentials can use, when the API can list them. */
  listModels(credentials: Credentials, signal?: AbortSignal): Promise<string[]>;
}

/** A failed provider call. `status` is the provider's HTTP status when there was one. */
export class LlmError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

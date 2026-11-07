export interface ChatRunOptions {
  /** Working directory the model may read and write: diagram.bpmn and attachments/. */
  cwd: string;
  /** The user's message. */
  prompt: string;
  /** Appended to the provider's own system prompt. */
  systemPrompt: string;
  /** Previous session to continue, if any. */
  sessionId: string | null;
}

export interface ChatRunResult {
  reply: string;
  sessionId: string | null;
  costUsd: number | null;
}

/** A model backend for the chat. It edits ./diagram.bpmn in `cwd` in place when asked for changes. */
export interface ChatProvider {
  name: string;
  run(options: ChatRunOptions): Promise<ChatRunResult>;
}

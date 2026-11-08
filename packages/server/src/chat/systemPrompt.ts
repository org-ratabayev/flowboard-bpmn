// The assistant's system prompt: prompts/bpmn-assistant.md, plus text a deployment appends
// through `chat.systemPromptAppend` (e.g. its own modeling conventions).

import fs from 'node:fs';
import path from 'node:path';

const PROMPT_FILE = path.join(import.meta.dirname, 'prompts', 'bpmn-assistant.md');

let base: string | null = null;

export function systemPrompt(append = ''): string {
  base ??= fs.readFileSync(PROMPT_FILE, 'utf8').trim();
  const extra = append.trim();
  return extra ? `${base}\n\n${extra}` : base;
}

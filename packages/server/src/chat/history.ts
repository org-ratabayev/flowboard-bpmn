// Turns stored messages into a history every provider accepts: roles alternate, it starts with
// the user, and every tool call has exactly one result right after it. Stored history can break
// these rules when a turn was cancelled, failed or hit its iteration limit mid-way.

import type { ContentBlock, LlmMessage } from '../llm/types.ts';

export const MISSING_RESULT = 'No result: the turn was stopped before this tool finished.';

export function toProviderHistory(stored: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }>): LlmMessage[] {
  // merge neighbours with the same role, drop empty messages
  const merged: LlmMessage[] = [];
  for (const message of stored) {
    if (!message.content.length) continue;
    const last = merged.at(-1);
    if (last && last.role === message.role) last.content = [...last.content, ...message.content];
    else merged.push({ role: message.role, content: [...message.content] });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();

  const out: LlmMessage[] = [];
  for (let i = 0; i < merged.length; i++) {
    const message = merged[i];
    if (message.role === 'assistant') {
      out.push(message);
      const calls = message.content.filter((b) => b.type === 'tool_use').map((b) => b.id);
      if (!calls.length) continue;
      // the next user message must open with one result per call; anything else follows it
      const next = merged[i + 1]?.role === 'user' ? merged[++i] : { role: 'user' as const, content: [] };
      const results = new Map<string, ContentBlock>();
      const rest: ContentBlock[] = [];
      for (const block of next.content) {
        if (block.type === 'tool_result') {
          if (calls.includes(block.toolUseId) && !results.has(block.toolUseId)) results.set(block.toolUseId, block);
        } else {
          rest.push(block);
        }
      }
      out.push({
        role: 'user',
        content: [
          ...calls.map((id): ContentBlock => results.get(id) ?? { type: 'tool_result', toolUseId: id, content: MISSING_RESULT, isError: true }),
          ...rest
        ]
      });
    } else {
      // results without a call right before them cannot be sent
      const content = message.content.filter((b) => b.type !== 'tool_result');
      if (content.length) out.push({ role: 'user', content });
    }
  }
  // two user messages can now be neighbours (e.g. an orphaned result was dropped): merge them again
  const final: LlmMessage[] = [];
  for (const message of out) {
    const last = final.at(-1);
    if (last && last.role === message.role) last.content = [...last.content, ...message.content];
    else final.push(message);
  }
  return final;
}

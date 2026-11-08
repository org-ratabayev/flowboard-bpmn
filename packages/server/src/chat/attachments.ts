// Files attached to a chat message. Only text files for now (plain text, CSV, Markdown, .bpmn);
// the browser reads them and sends their text. Each becomes one text block of the user message,
// wrapped in an <attachment> element so the model (and the chat panel) can tell it from the
// message itself. Images and PDFs would need their own content block types per provider.

import type { ContentBlock } from '../llm/types.ts';

export const ATTACHMENT_LIMITS = { count: 3, bytes: 2 * 1024 * 1024, totalBytes: 6 * 1024 * 1024 };
export const ATTACHMENT_EXTENSIONS = ['.txt', '.csv', '.md', '.markdown', '.bpmn'];

const MAX_NAME = 120;

type Parsed = { blocks: ContentBlock[] } | { status: number; error: string };

function cleanName(value: unknown): string {
  const base = String(value ?? '').split(/[\\/]/).pop() ?? '';
  return base.replace(/[\u0000-\u001f"<>&]/g, '_').trim().slice(0, MAX_NAME);
}

/** The text block for one attached file (also used by tests and the panel's parser). */
export function attachmentBlock(name: string, text: string): ContentBlock {
  // the closing tag cannot appear inside, so the file cannot end its own attachment early
  return { type: 'text', text: `<attachment name="${name}">\n${text.replaceAll('</attachment>', '<\\/attachment>')}\n</attachment>` };
}

/** Checks the `attachments` of a turn request: [{ name, text }]. */
export function parseAttachments(value: unknown): Parsed {
  if (value === undefined || value === null) return { blocks: [] };
  if (!Array.isArray(value)) return { status: 400, error: 'attachments must be a list' };
  if (value.length > ATTACHMENT_LIMITS.count) return { status: 400, error: `At most ${ATTACHMENT_LIMITS.count} files can be attached to a message` };
  let total = 0;
  const blocks: ContentBlock[] = [];
  for (const item of value as Array<{ name?: unknown; text?: unknown } | null>) {
    const name = cleanName(item?.name);
    if (!name || typeof item?.text !== 'string') return { status: 400, error: 'Each attachment needs a name and its text' };
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
    if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
      return { status: 415, error: `${name}: only text files can be attached (${ATTACHMENT_EXTENSIONS.join(', ')})` };
    }
    const bytes = Buffer.byteLength(item.text);
    if (bytes > ATTACHMENT_LIMITS.bytes) return { status: 413, error: `${name} is larger than ${ATTACHMENT_LIMITS.bytes / 1024 / 1024} MB` };
    total += bytes;
    if (total > ATTACHMENT_LIMITS.totalBytes) return { status: 413, error: `Attachments are limited to ${ATTACHMENT_LIMITS.totalBytes / 1024 / 1024} MB per message` };
    blocks.push(attachmentBlock(name, item.text));
  }
  return { blocks };
}

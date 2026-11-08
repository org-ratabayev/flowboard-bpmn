// Text files attached to a chat message (same limits as the server, chat/attachments.ts):
// plain text, CSV, Markdown and .bpmn; at most 3 files, 2 MB each, 6 MB together.

export const LIMITS = { count: 3, bytes: 2 * 1024 * 1024, totalBytes: 6 * 1024 * 1024 };
export const EXTENSIONS = ['.txt', '.csv', '.md', '.markdown', '.bpmn'];

const extension = (name) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');

/** Why these files cannot be attached together, or null. `files`: [{ name, size }]. */
export function attachmentProblem(files) {
  if (files.length > LIMITS.count) return `At most ${LIMITS.count} files per message`;
  for (const file of files) {
    if (!EXTENSIONS.includes(extension(file.name))) return `${file.name}: only text files can be attached (${EXTENSIONS.join(', ')})`;
    if (file.size > LIMITS.bytes) return `${file.name} is larger than 2 MB`;
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > LIMITS.totalBytes) return 'Attachments are limited to 6 MB per message';
  return null;
}

/** The files as the turn request expects them: [{ name, text }]. */
export function readAttachments(files) {
  return Promise.all(files.map((file) => file.text().then((text) => ({ name: file.name, text }))));
}

const BLOCK = /^<attachment name="([^"]*)">\n/;

/** The file name when a stored text block is an attachment (see the server's attachmentBlock), else null. */
export function attachmentName(text) {
  return BLOCK.exec(text)?.[1] ?? null;
}

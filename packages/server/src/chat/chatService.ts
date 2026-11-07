// Each chat has a working directory (<workDir>/<chatId>/) holding diagram.bpmn,
// attachments/ and session.json (the provider's session id, to continue the conversation).

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { looksLikeBpmn } from '../bpmn.ts';
import { HttpError } from '../http.ts';
import type { ChatProvider } from './types.ts';

const CHAT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const CHAT_SYSTEM_PROMPT = `You are a BPMN 2.0 modeling assistant embedded in a web-based bpmn.io editor.
The diagram the user is editing is ./diagram.bpmn. It is rewritten from the editor's current (possibly unsaved) state before every message, so always read it fresh.
Files the user attached are in ./attachments/.

When the user asks for changes, edit ./diagram.bpmn in place:
- Keep it valid BPMN 2.0 XML that bpmn-js can import.
- Every element you add needs diagram interchange inside the existing bpmndi:BPMNPlane: a bpmndi:BPMNShape with dc:Bounds for flow nodes, pools, lanes and data objects, and a bpmndi:BPMNEdge with di:waypoint elements for flows. Typical sizes: task 100x80, event 36x36, gateway 50x50.
- Lay out left to right without overlaps, keep elements inside their pool/lane and resize pools/lanes when needed.
- Preserve existing IDs, names, colors and positions unless the request requires changing them.
- Use readable unique IDs, e.g. Activity_ReviewOrder.
If the user only asks a question, do not modify the file.
Reply concisely in plain text: what you changed, or the answer. Never paste the XML into the reply.`;

export interface ChatRequest {
  message?: unknown;
  xml?: unknown;
  chatId?: unknown;
  attachments?: unknown;
}

export interface ChatResponse {
  chatId: string;
  reply: string;
  xml: string | null;
  costUsd: number | null;
  provider: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, file);
}

function safeFileName(name: unknown): string {
  const base = path.basename(String(name || 'file')).replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '').slice(0, 120);
  return base || 'file';
}

async function saveAttachments(dir: string, attachments: unknown[]): Promise<string[]> {
  await fsp.mkdir(dir, { recursive: true });
  const saved: string[] = [];
  for (const a of attachments as Array<{ name?: unknown; data?: unknown } | null>) {
    if (!a || typeof a.data !== 'string') continue;
    let name = safeFileName(a.name);
    const ext = path.extname(name);
    for (let n = 2; await exists(path.join(dir, name)); n++) name = `${path.basename(name, ext)}-${n}${ext}`;
    await fsp.writeFile(path.join(dir, name), Buffer.from(a.data, 'base64'));
    saved.push(`attachments/${name}`);
  }
  return saved;
}

export function createChatService({ provider, workDir }: { provider: ChatProvider; workDir: string }) {
  const busyChats = new Set<string>();

  return {
    async chat(projectId: string, body: ChatRequest): Promise<ChatResponse> {
      const message = String(body.message || '').trim();
      if (!message) throw new HttpError(400, 'Message is empty');
      if (!looksLikeBpmn(body.xml)) throw new HttpError(400, 'Current diagram is missing');
      const xml = body.xml;

      const chatId = typeof body.chatId === 'string' && CHAT_ID_RE.test(body.chatId) ? body.chatId : crypto.randomUUID();
      if (busyChats.has(chatId)) throw new HttpError(409, 'Claude is still working on the previous message');
      busyChats.add(chatId);
      try {
        const dir = path.join(workDir, chatId);
        await fsp.mkdir(dir, { recursive: true });
        const sessionFile = path.join(dir, 'session.json');
        let session: { projectId?: string; sessionId?: string | null } = {};
        try {
          session = JSON.parse(await fsp.readFile(sessionFile, 'utf8'));
        } catch { /* new chat */ }
        if (session.projectId && session.projectId !== projectId) throw new HttpError(400, 'Chat belongs to another project');

        const diagramFile = path.join(dir, 'diagram.bpmn');
        await fsp.writeFile(diagramFile, xml);
        const attached = await saveAttachments(path.join(dir, 'attachments'), Array.isArray(body.attachments) ? body.attachments : []);

        const prompt = attached.length ? `${message}\n\nNewly attached files:\n${attached.map((f) => `- ./${f}`).join('\n')}` : message;
        const result = await provider.run({ cwd: dir, prompt, systemPrompt: CHAT_SYSTEM_PROMPT, sessionId: session.sessionId || null });
        await writeAtomic(sessionFile, JSON.stringify({ projectId, sessionId: result.sessionId }));

        const after = await fsp.readFile(diagramFile, 'utf8');
        let changed: string | null = null;
        let reply = result.reply;
        if (after !== xml) {
          if (looksLikeBpmn(after)) changed = after;
          else reply += '\n\n(The diagram file Claude produced is not valid BPMN, so it was not applied.)';
        }
        return { chatId, reply, xml: changed, costUsd: result.costUsd, provider: provider.name };
      } finally {
        busyChats.delete(chatId);
      }
    }
  };
}

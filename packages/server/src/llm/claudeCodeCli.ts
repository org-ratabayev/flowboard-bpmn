// The local Claude Code CLI (`claude -p`) as a chat provider, for development only: it bills the
// one account signed in on the server machine for every user, so the config allows it only with
// AUTH=dev.
//
// The CLI cannot call the editor tools itself, so this adapter drives them for it, one step per
// agent-loop iteration:
//   1. ask the editor for the diagram (bpmn_get_xml)
//   2. run the CLI on a copy of it in a temp folder; if it changed the file, hand the result to
//      the editor (bpmn_replace_xml), which validates it and shows it as a proposal
//   3. stop
// Earlier turns are sent as a plain-text transcript, so no CLI session state is kept.
//
// The CLI runs locked down: only file tools, confined to the temp folder (--restricted), no shell,
// no web, no MCP servers (--strict-mcp-config), no user hooks or settings, no permission prompts.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ProviderEntry } from './catalog.ts';
import { LlmError, type ContentBlock, type LlmEvent, type LlmMessage, type LlmProvider, type StreamRequest } from './types.ts';

export interface ClaudeCodeOptions {
  bin: string;
  timeoutMs: number;
  /** Each call gets a temp folder below this one. */
  workDir: string;
}

/** Model names the CLI understands; "default" leaves the choice to the CLI. */
export const CLAUDE_CODE_MODELS = ['default', 'sonnet', 'opus', 'haiku'];

export const CLAUDE_CODE_ID = 'claude-code';

/** The catalog entry the server adds when chat.claudeCode is switched on (AUTH=dev only). */
export function claudeCodeEntry(options: { bin: string; model: string; timeoutMs: number }, workDir: string): ProviderEntry {
  return {
    id: CLAUDE_CODE_ID,
    label: 'Claude Code CLI (this server, dev only)',
    type: 'claude-code-cli',
    models: !options.model || CLAUDE_CODE_MODELS.includes(options.model) ? CLAUDE_CODE_MODELS : [options.model, ...CLAUDE_CODE_MODELS],
    defaultModel: options.model || 'default',
    credentials: { from: 'local' },
    headers: {},
    cli: { bin: options.bin, timeoutMs: options.timeoutMs, workDir }
  };
}

const GET_PREFIX = 'cli_get_';
const PUT_PREFIX = 'cli_put_';

export const CLAUDE_CODE_PROMPT = `You are a BPMN 2.0 modeling assistant embedded in a web-based bpmn.io editor.
The diagram the user has open is ./diagram.bpmn (its current state, including unsaved changes).
When the user asks for changes, edit ./diagram.bpmn in place:
- Keep it valid BPMN 2.0 XML that bpmn-js can import.
- Every element you add needs diagram interchange inside the existing bpmndi:BPMNPlane: a bpmndi:BPMNShape with dc:Bounds for flow nodes, pools, lanes and data objects, and a bpmndi:BPMNEdge with di:waypoint elements for flows. Typical sizes: task 100x80, event 36x36, gateway 50x50.
- Lay out left to right without overlaps, keep elements inside their pool or lane.
- Keep existing ids, names, colors and positions unless the request requires changing them.
If the user only asks a question, or the request says you may not edit, do not modify the file.
Reply concisely in plain text: what you changed, or the answer. Never paste the XML into the reply.`;

const textOf = (blocks: ContentBlock[]) => blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');

/** Index of the message holding the user's prompt of the current turn. */
function promptIndex(messages: LlmMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content.some((b) => b.type === 'text')) return i;
  }
  return -1;
}

/** Earlier turns as text, then the current request. */
export function cliPrompt(messages: LlmMessage[], index: number, canEdit: boolean): string {
  const earlier = messages.slice(0, index)
    .map((m) => ({ who: m.role === 'user' ? 'User' : 'Assistant', text: textOf(m.content).trim() }))
    .filter((m) => m.text)
    .map((m) => `${m.who}: ${m.text}`);
  const request = textOf(messages[index].content);
  const parts = [];
  if (earlier.length) parts.push(`Conversation so far:\n${earlier.join('\n\n')}`, 'Current request:');
  parts.push(request);
  if (!canEdit) parts.push('(The user can only view this diagram: do not modify ./diagram.bpmn.)');
  return parts.join('\n\n');
}

interface CliResult { reply: string; costUsd: number | null; inputTokens: number; outputTokens: number }

function runCli(options: ClaudeCodeOptions, cwd: string, prompt: string, model: string, signal?: AbortSignal): Promise<CliResult> {
  const args = [
    '-p',
    '--output-format', 'json',
    '--restricted',
    '--strict-mcp-config',
    '--tools', 'Read,Edit,Write,Glob,Grep',
    '--permission-mode', 'acceptEdits',
    '--permission-prompts', 'none',
    '--disable-slash-commands',
    '--append-system-prompt', CLAUDE_CODE_PROMPT
  ];
  if (model && model !== 'default') args.push('--model', model);

  return new Promise((resolve, reject) => {
    const child = spawn(options.bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const stop = () => child.kill('SIGTERM');
    const timer = setTimeout(() => {
      stop();
      reject(new LlmError(`Claude Code did not answer within ${Math.round(options.timeoutMs / 1000)} s`));
    }, options.timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err: NodeJS.ErrnoException) => {
      done();
      reject(new LlmError(err.code === 'ENOENT' ? `Claude Code CLI not found ("${options.bin}"); install it or set CLAUDE_BIN` : err.message));
    });
    child.on('close', (code) => {
      done();
      if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
      let out;
      try {
        out = JSON.parse(stdout);
      } catch {
        return reject(new LlmError(`Claude Code exited with code ${code}: ${(stderr || stdout).trim().slice(0, 500)}`));
      }
      if (out.is_error) return reject(new LlmError(out.result || 'Claude Code reported an error'));
      resolve({
        reply: out.result || '',
        costUsd: typeof out.total_cost_usd === 'number' ? out.total_cost_usd : null,
        inputTokens: Number(out.usage?.input_tokens ?? 0),
        outputTokens: Number(out.usage?.output_tokens ?? 0)
      });
    });
    child.stdin.end(prompt);
  });
}

export function createClaudeCodeProvider(options: ClaudeCodeOptions): LlmProvider {
  return {
    async *stream(request: StreamRequest): AsyncGenerator<LlmEvent> {
      const { messages } = request;
      const index = promptIndex(messages);
      if (index === -1) throw new LlmError('Claude Code: no request found');
      const turn = messages.slice(index + 1);
      const results = turn.flatMap((m) => m.content).filter((b) => b.type === 'tool_result') as Array<Extract<ContentBlock, { type: 'tool_result' }>>;
      const last = results.at(-1);
      const canEdit = request.tools.some((t) => t.name === 'bpmn_replace_xml');

      if (!last) {
        yield { type: 'tool_call', id: `${GET_PREFIX}${crypto.randomUUID()}`, name: 'bpmn_get_xml', input: {} };
        yield { type: 'usage', inputTokens: 0, outputTokens: 0 };
        return yield { type: 'done', stopReason: 'tool_use' };
      }
      if (last.toolUseId.startsWith(PUT_PREFIX)) {
        if (last.isError) yield { type: 'text', text: `\n\nThe editor could not apply the change: ${last.content}` };
        yield { type: 'usage', inputTokens: 0, outputTokens: 0 };
        return yield { type: 'done', stopReason: 'end' };
      }
      if (last.isError) throw new LlmError(`Claude Code: the editor did not provide the diagram (${last.content})`);

      const dir = path.join(options.workDir, crypto.randomUUID());
      await fsp.mkdir(dir, { recursive: true });
      try {
        const file = path.join(dir, 'diagram.bpmn');
        await fsp.writeFile(file, last.content);
        const result = await runCli(options, dir, cliPrompt(messages, index, canEdit), request.model, request.signal);
        const after = await fsp.readFile(file, 'utf8');
        if (result.reply) yield { type: 'text', text: result.reply };
        yield { type: 'usage', inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd ?? undefined };
        if (canEdit && after !== last.content) {
          yield { type: 'tool_call', id: `${PUT_PREFIX}${crypto.randomUUID()}`, name: 'bpmn_replace_xml', input: { xml: after } };
          return yield { type: 'done', stopReason: 'tool_use' };
        }
        yield { type: 'done', stopReason: 'end' };
      } finally {
        await fsp.rm(dir, { recursive: true, force: true });
      }
    },

    async listModels(): Promise<string[]> {
      return CLAUDE_CODE_MODELS;
    }
  };
}

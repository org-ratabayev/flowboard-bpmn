// Chat provider that runs the local Claude Code CLI headless (`claude -p`).
//
// The chat is reachable by anyone with the editor link, so the CLI is locked down:
// only file tools, confined to the chat's working directory (--restricted), no shell,
// no web, no MCP servers/connectors (--strict-mcp-config), no user hooks or settings,
// and anything that would need a permission prompt is denied.

import { spawn } from 'node:child_process';
import type { ChatProvider, ChatRunOptions, ChatRunResult } from './types.ts';

export interface ClaudeCodeOptions {
  bin: string;
  model: string;
  timeoutMs: number;
}

export function createClaudeCodeProvider({ bin, model, timeoutMs }: ClaudeCodeOptions): ChatProvider {
  function run({ cwd, prompt, systemPrompt, sessionId }: ChatRunOptions): Promise<ChatRunResult> {
    const args = [
      '-p',
      '--output-format', 'json',
      '--restricted',
      '--strict-mcp-config',
      '--tools', 'Read,Edit,Write,Glob,Grep',
      '--permission-mode', 'acceptEdits',
      '--permission-prompts', 'none',
      '--disable-slash-commands',
      '--append-system-prompt', systemPrompt
    ];
    if (sessionId) args.push('--resume', sessionId);
    if (model) args.push('--model', model);

    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Claude did not answer within ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(err.code === 'ENOENT'
          ? new Error(`Claude Code CLI not found ("${bin}"). Install it or set CLAUDE_BIN.`)
          : err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        let out;
        try {
          out = JSON.parse(stdout);
        } catch {
          return reject(new Error(`Claude Code exited with code ${code}: ${(stderr || stdout).trim().slice(0, 500)}`));
        }
        if (out.is_error) return reject(new Error(out.result || 'Claude Code reported an error'));
        resolve({ reply: out.result || '', sessionId: out.session_id || null, costUsd: out.total_cost_usd ?? null });
      });

      child.stdin.end(prompt);
    });
  }

  return { name: 'claude-code', run };
}

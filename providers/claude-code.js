'use strict';

// Chat provider that runs the local Claude Code CLI headless (`claude -p`).
//
// The chat is reachable by anyone with the editor link, so the CLI is locked down:
// only file tools, confined to the chat's working directory (--restricted), no shell,
// no web, no MCP servers/connectors (--strict-mcp-config), no user hooks or settings,
// and anything that would need a permission prompt is denied.

const { spawn } = require('node:child_process');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || '';
const TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS) || 5 * 60 * 1000;

/**
 * @param {object} opts
 * @param {string} opts.cwd           working directory the model may read/write
 * @param {string} opts.prompt        user message
 * @param {string} opts.systemPrompt  appended to Claude Code's system prompt
 * @param {string|null} opts.sessionId  previous session to continue, if any
 * @returns {Promise<{ reply: string, sessionId: string|null, costUsd: number|null }>}
 */
function run({ cwd, prompt, systemPrompt, sessionId }) {
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
  if (CLAUDE_MODEL) args.push('--model', CLAUDE_MODEL);

  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Claude did not answer within ${Math.round(TIMEOUT_MS / 1000)}s`));
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT'
        ? new Error(`Claude Code CLI not found ("${CLAUDE_BIN}"). Install it or set CLAUDE_BIN.`)
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

module.exports = { name: 'claude-code', run };

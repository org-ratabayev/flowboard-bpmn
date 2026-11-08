// Drift check for the agent briefing (AGENTS.md): the paths and commands it names must exist.
//
// Only text in backticks is checked, and only what looks like a repo path:
//   - contains a slash (e.g. `packages/server/src/config.ts`): must exist relative to the repo root;
//     in a glob (`test/*.test.mjs`) the part before the first wildcard must exist;
//   - a bare file name with a known extension (e.g. `sqlStore.ts`): a file of that name must exist.
// Tokens with spaces, URLs, routes (`/api/...`), package names (`@scope/name`) and placeholders
// (`<dir>`) are skipped. `pnpm <script>` inside backticks must be a script of package.json.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/server.mjs';

const EXTENSIONS = /\.(ts|mjs|js|json|md|html|css|yaml|yml|example)$/;
const PNPM_BUILTINS = new Set(['install', 'add', 'remove', 'update', 'exec', 'dlx', 'run']);
const SKIP_DIRS = new Set(['node_modules', 'dist']);

const briefing = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
const spans = [...briefing.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());

/** Names of all files in the repo (without dependencies, build output and dot-folders). */
function fileNames(dir, out = new Set()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) out.add(entry.name);
    else if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) fileNames(path.join(dir, entry.name), out);
  }
  return out;
}

function looksLikePath(token) {
  if (/[\s:<>{}()=,'"]/.test(token)) return false; // prose, code, URLs, placeholders
  if (/^[/@~$-]/.test(token)) return false; // routes, package names, home paths, variables, flags
  if (token.startsWith('.') && !/^\.[\w-]+\.\w+$/.test(token)) return false; // `.env`, `.ts`, `.default`
  return token.includes('/') || EXTENSIONS.test(token);
}

/** The part of a path before its first wildcard segment (`test/*.test.mjs` gives `test`). */
function fixedPart(token) {
  const parts = token.replace(/\/$/, '').split('/');
  const glob = parts.findIndex((part) => part.includes('*'));
  return (glob === -1 ? parts : parts.slice(0, glob)).join('/');
}

describe('AGENTS.md', () => {
  it('names only paths that exist', () => {
    const names = fileNames(ROOT);
    const missing = [];
    for (const token of new Set(spans.filter(looksLikePath))) {
      const exists = token.includes('/')
        ? fs.existsSync(path.join(ROOT, fixedPart(token) || '.'))
        : token.includes('*') || names.has(token);
      if (!exists) missing.push(token);
    }
    assert.deepEqual(missing, [], `AGENTS.md names paths that do not exist: ${missing.join(', ')}`);
  });

  it('names only pnpm scripts that exist', () => {
    const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const commands = spans.flatMap((span) => [...span.matchAll(/(?:^|\s)pnpm\s+([a-z][\w:-]*)/g)].map((m) => m[1]));
    assert.ok(commands.length > 0, 'expected pnpm commands in AGENTS.md');
    const missing = [...new Set(commands)].filter((name) => !PNPM_BUILTINS.has(name) && !Object.hasOwn(scripts, name));
    assert.deepEqual(missing, [], `AGENTS.md names pnpm scripts missing from package.json: ${missing.join(', ')}`);
  });

  it('stays compact and is loaded by CLAUDE.md', () => {
    const lines = briefing.split('\n').length;
    assert.ok(lines <= 300, `AGENTS.md has ${lines} lines; keep it at about 250 or fewer`);
    assert.match(fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md$/m);
  });
});

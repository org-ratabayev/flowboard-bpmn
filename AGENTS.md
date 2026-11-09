# AGENTS.md

Briefing for coding agents and new contributors. Read it before any task; it is meant to be enough to start.
Paths with a slash are repo-relative; bare file names live in the directory of their table row or sentence.
Both are checked by `test/docs.test.mjs`.

## What this is

Flowboard: a bpmn.io (bpmn-js) BPMN editor with a server. Projects with full, immutable version history in SQLite
or Postgres; sign-in (`dev`, `trusted-headers`, `oidc`) and personal access tokens; per-project sharing (owner /
editor / viewer, share links, email invites, audit log); live collaboration over SSE with live role changes; an AI
assistant that edits the open diagram through editor tools, as proposals the user keeps or undoes, on a server-side
agent loop with configurable providers (Anthropic, OpenAI-compatible). An MCP server and an MCP client in chat are
planned.

- User-facing behaviour, env vars and APIs: `README.md` (authoritative for users).
- Full design and phase plan: `docs/redesign-plan.md`. Done: phases 1-6 (6a providers and keys, 6b agent loop,
  6c chat UI and editor tools). Next: 7-9 (MCP), 10 (docs, example deployment). Where the plan's target layout
  (section 3.1: a shared package, config/ and routes/ folders, a lint step, a dev script) differs from the code,
  the code is what exists today.

**Keep it generic.** No real hostnames, credentials, personal data or environment-specific settings in code, docs,
examples or tests; use placeholders such as `example.com` and `idp.example.com`. Deployment settings come from
environment variables or an `APP_CONFIG` module at runtime, not from the repo.

## Repo map

| Path | What |
|---|---|
| `package.json` | Root scripts (below); Node `>=22.18`; dev dependencies only |
| `pnpm-workspace.yaml` | Workspace `packages/*`, `apps/*`; `minimumReleaseAge` (new versions must be 14+ days old) |
| `tsconfig.json` | Type-check only (`noEmit`, `erasableSyntaxOnly`) |
| `vitest.config.ts` | Unit tests: `packages/*/src/**/*.test.ts`, browser modules `packages/web/src/**/*.test.mjs` (jsdom) |
| `apps/standalone/src/main.ts` | Default entry (`pnpm start`): loads `.env`, env, `APP_CONFIG`; calls `createServer` |
| `apps/standalone/src/cli.ts` | `pnpm flowboard import/export` (project folders) |
| `packages/server/` | The server as a library (`@flowboard/server`, entry `packages/server/src/index.ts`) |
| `packages/web/` | Browser app (`@flowboard/web`): HTML pages + `packages/web/src/`, built by Vite into dist/ (not committed) |
| `test/` | Black-box HTTP API tests (`node:test`), one server process per file |
| `test/browser/` | Headless Chrome check of the chat and the editor controls (zoom buttons, no Copy link) in the real editor (`chat-flow.mjs`), driven over CDP (`cdp.mjs`, no dependencies) |
| `scripts/license-list.mjs` | Regenerates `THIRD_PARTY_LICENSES.md` |
| `docker-compose.yml` | Optional local Postgres (tests don't need it) |
| `.env.example` | Every env var with a comment; copy to `.env` (git-ignored) |

Server (`packages/server/src/`):

| Path | What |
|---|---|
| `packages/server/src/server.ts` | `createServer`: CSRF Origin check, authentication (token or session), top-level routing (`/auth`, pages, static, `/api/llm`, `/api`), startup wiring, error handler |
| `packages/server/src/routes.ts` | `/api/me`, `/api/tokens`, `/api/users`, `/api/share/join`, `/api/projects/...` (role check, access, live, history, download, chat dispatch) |
| `packages/server/src/http.ts` | `send`, `readJson`, `HttpError`, `PAGE_CSP`, `serveStatic` |
| `packages/server/src/config.ts` | zod `configSchema`, `configFromEnv` (env var mapping), `mergeConfig`, `loadConfigFromEnv`, `defineConfig` |
| `packages/server/src/appSecret.ts` | `APP_SECRET` resolution (generated file only for SQLite) |
| `packages/server/src/events.ts` | Event bus with topics `access`, `chat`; in-process or Postgres LISTEN/NOTIFY (one channel per topic); payload is an id only |
| `packages/server/src/live.ts` | Live rooms: presence, cursors, shared unsaved diagram (in memory), live role refresh |
| `packages/server/src/bpmn.ts` | `looksLikeBpmn`, `EMPTY_DIAGRAM` |
| `packages/server/src/auth/` | `index.ts` (`createAuth`: dev, trusted-headers), `oidc.ts`, `common.ts` (sessions), `authStore.ts` (users, sessions), `tokenStore.ts` (PATs), `requestChecks.ts` (cookies, `isSameOrigin`, proxy address matching) |
| `packages/server/src/storage/` | `db.ts` (`Db` abstraction), `sqliteDb.ts`, `postgresDb.ts`, `migrations.ts`, `sqlStore.ts` (documents, versions), `accessStore.ts` (roles, grants, links, invites, audit), `folder.ts` (import/export), `index.ts` (`openStore`), `testBackends.ts` |
| `packages/server/src/llm/` | `types.ts` (`LlmProvider`, content blocks, `Credentials`), `catalog.ts` (provider list, credential sources), `anthropic.ts`, `openai.ts`, `keyStore.ts` (encrypted personal keys), `routes.ts` (`/api/llm`, model lists, `redact`), `sse.ts`, `claudeCodeCli.ts` (dev-only Claude Code CLI provider) |
| `packages/server/src/chat/` | AI chat: `agentLoop.ts` (one turn: model calls, tool calls, role re-check), `agentRoutes.ts` (chat routes, limits), `conversationStore.ts` (conversations, messages, turns, tool calls, rate limit), `toolSpecs.ts` (browser tools, `toolsForRole`, `toolRefusal`), `attachments.ts`, `systemPrompt.ts` with `packages/server/src/chat/prompts/bpmn-assistant.md`, `history.ts` (provider-valid history), `signals.ts` (wake the instance running a turn) |

**AI chat, current design** (contract in README "Chat API"): the browser opens a conversation per user and document,
posts a turn and reads its event stream; the server runs the agent loop and sends `tool_request` events; the editor
runs the tool and posts the result to `tool-results` (stored in the database, so any instance can accept it). Edits
of one turn form one proposal (Keep / Undo); `bpmn_summarize_changes` gives the version note. Attachments are text
files only (3 per message, 2 MB each, 6 MB total). `CHAT_TURNS_PER_MINUTE` (default 10) limits messages per user
across instances. `CHAT_CLAUDE_CODE=on` adds the local Claude Code CLI as a provider, dev only (`AUTH=dev`). The
former CLI-only chat (chatService.ts, claudeCode.ts, the old POST /api/projects/:id/chat) is removed.

Web (`packages/web/`): pages `index.html` (project list), `editor.html`, `login.html`, `settings.html`, `join.html`
(share link), each loading one module from `packages/web/src/` (`index.mjs`, `editor.mjs`, `login.mjs`,
`settings.mjs`, `join.mjs`). Shared modules: `session.mjs` (signed-in user, 401 handling), `live.mjs`
(collaboration client), `share.mjs` (Share dialog), `readOnly.mjs` (viewer mode), `zoomControls.mjs` (zoom
buttons), `lint-config.mjs` (bpmnlint rules), `styles.css`. New pages must be added to `packages/web/vite.config.ts` and routed in `packages/server/src/server.ts`.
Chat panel (`packages/web/src/chat/`, loaded by `editor.mjs`): `panel.mjs` (conversations, model picker, streamed
reply, Keep / Undo), `stream.mjs` (event stream of a POST), `tools.mjs` (runs tool calls), `edit.mjs` (edit tools
via `modeling`), `inspect.mjs` (read tools), `validate.mjs` (checks `bpmn_replace_xml`), `proposal.mjs` (Keep /
Undo, highlights), `changes.mjs` (bpmn-js-differ, version note), `attachments.mjs`.

Tests: unit tests `*.test.ts` next to the code (vitest); browser module tests `*.test.mjs` next to the module in
jsdom (`packages/web/src/chat/test-fixtures.mjs` has diagrams); API tests `test/*.test.mjs` with helpers in
`test/helpers/server.mjs` (start server, sign in, requests, live streams), `test/helpers/chat.mjs` (plays the
editor in chat tests) and `test/helpers/pglite-server.mjs`; headless Chrome in `test/browser/`.

## Commands

Node 22.18+ and Corepack (`corepack enable` once, or prefix commands with `corepack`).

| Command | Does | Needs |
|---|---|---|
| `corepack pnpm install` | Install dependencies | Network (npm registry) |
| `pnpm build` | Build the web app into packages/web/dist/ | - |
| `pnpm start` | Build, then run the server on port 3000 | `.env` optional; data in `BPMN_DIR` |
| `pnpm flowboard import --from <dir>` / `export --to <dir>` | Project folder import/export | Same settings as the server |
| `pnpm typecheck` | `tsc` over `packages/*/src`, `apps/*/src` and `vitest.config.ts` | - |
| `pnpm test` | Unit tests, web build, API tests on SQLite, then the browser check | Chrome optional |
| `pnpm test:unit` | vitest only (store, auth and llm suites run on SQLite and PGlite; browser modules in jsdom) | - |
| `pnpm test:api` | Build + API tests (SQLite) | Free local ports |
| `pnpm test:api:postgres` | Build + API tests with `TEST_STORAGE=postgres` (PGlite, no Docker) | Free local ports |
| `pnpm test:browser` | Build + the chat in headless Chrome (`test/browser/chat-flow.mjs`); without Chrome it prints `BROWSER TESTS SKIPPED` and passes | Chrome or Chromium (`CHROME_BIN`) |
| `pnpm license-list` | Regenerate `THIRD_PARTY_LICENSES.md` after dependency changes | Installed dependencies |

Single file: `node --test test/sharing.test.mjs` (after `pnpm build`), `pnpm test:unit packages/server/src/config.test.ts`.
`TEST_SERVER_CMD` runs the API tests against another server command.

## Conventions

- **TypeScript without a build.** Node runs `.ts` directly (type stripping); `tsc` only checks. Only erasable
  syntax: no `enum`, no `namespace`, no constructor parameter properties, no decorators; use union types and `as const`
  objects. Import local files with the `.ts` extension; type-only imports use `import type` (`verbatimModuleSyntax`).
- **Style.** ES modules, factory functions (`createXxx(...)` returning an object of functions) rather than classes
  (only small `Error` subclasses). camelCase file names. Each module starts with a short comment saying what it is
  and how it fits; comment the why, not the what. Route handlers list their routes in a comment above them.
- **Config.** One zod schema in `packages/server/src/config.ts` with defaults (`.default`, `.prefault({})` for
  nested objects) and cross-field `.refine` checks with actionable messages. Env vars are mapped in
  `configFromEnv`: `UPPER_SNAKE` names, unset or empty means `undefined` (so other sources win), numbers via
  `number('NAME')`, on/off flags as `env.X ? env.X !== 'off' : undefined`, lists comma-separated, JSON via `json()`.
  Opt-in flags for risky features use the strict form `env.X ? env.X === 'on' : undefined`, so only `on` enables them
  (example: `CHAT_CLAUDE_CODE`, which bills one account for every user).
  Priority: env > `APP_CONFIG` module > entry-point defaults > schema defaults. Secrets never get defaults.
- **Database.** All SQL goes through `Db` / `Queryable` (`packages/server/src/storage/db.ts`): `$1, $2` placeholders,
  `db.transaction(fn)` for writes, `db.read(fn)` for reads. Every query must run on SQLite **and** Postgres: stick
  to the common subset (`INSERT ... ON CONFLICT` works on both), convert timestamps with `toIso()` (Date from Postgres,
  string from SQLite), store JSON as `TEXT`. If dialects must differ, branch on `db.dialect`.
- **Migrations** (`packages/server/src/storage/migrations.ts`): append a new entry to `SCHEMA_CHANGES` with the next
  number (`009_name`) and SQL for both `sqlite` and `postgres`. Never edit or reorder an applied migration. Statements
  are split on `;`, so no semicolons inside a statement (no triggers or function bodies).
- **HTTP.** Plain `node:http`, no framework. Handlers take `(ctx, req, res, ...)`, match on `parts` (the decoded path
  split at `/`) and `req.method`, and `return send(res, status, body)`. JSON bodies via `readJson(req, maxBytes)`
  with a small limit per route. Error bodies are `{ error: 'Human readable message' }`; 405 for a wrong method.
  Throw `HttpError(status, message)` for expected failures; anything else becomes a logged 500 with
  `Internal error` (no details leak). Validate every input field by hand (types, lengths, ranges).
- **Web.** Plain ES modules (`.mjs`) bundled by Vite; no framework, no inline scripts or inline event handlers
  (pages are served with a strict CSP). Escape user-provided text before putting it into HTML (see `esc` in
  `packages/web/src/share.mjs`) or use `textContent`. Browser module tests start with `// @vitest-environment jsdom`;
  what needs real rendering (bpmn-js `modeling`, layout, SVG) goes into `test/browser/`.
- **Dependencies.** Few and exact: pin exact versions (no `^`/`~`), prefer Node built-ins, justify each new one in
  the PR, run `pnpm license-list` afterwards. No GPL/AGPL code.

## How-to recipes

- **Config / env var:** add the key to `baseSchema` in `packages/server/src/config.ts` (with default and a doc
  comment), map the env var in `configFromEnv`, add a test to `packages/server/src/config.test.ts`, document it in
  `.env.example` and in the env var table of the matching README section.
- **API route:** add it to `handleApi` in `packages/server/src/routes.ts` (or a handler module it dispatches to)
  below the role check; gate it with `if (!allowed('editor')) return;` (or `'owner'`), viewer is the minimum anyway.
  Unknown or inaccessible projects answer 404. Decide whether access tokens may use it (`ctx.viaToken`). Add the
  route to the role matrix in `test/sharing.test.mjs` and document it in the README.
- **Migration:** see Conventions; the data access goes into the matching store (`sqlStore.ts`, `accessStore.ts`,
  ...); cover it with a store unit test using `describe.each(backends)` from `packages/server/src/storage/testBackends.ts`.
- **API test:** new `test/<area>.test.mjs` with `node:test` and `node:assert/strict`; `before(() => startServer(env))`
  from `test/helpers/server.mjs`, `after(() => server.stop())`. Use `server.as('Name')(method, path, body)` for
  signed-in requests, `server.grant(...)` for roles, `server.anonymous(...)` without a session, `openLive(...)` for
  SSE. It runs on SQLite and, with `pnpm test:api:postgres`, on Postgres.
- **LLM provider:** a new entry of an existing type needs no code (`LLM_PROVIDERS` or `llm.providers` in
  `APP_CONFIG`). A new provider type: implement `LlmProvider` from `packages/server/src/llm/types.ts` in its own file
  in `packages/server/src/llm/`, add the type to `providerSchema` in `packages/server/src/config.ts` and to
  `ProviderEntry` / `createCatalog` in `packages/server/src/llm/catalog.ts`, test it against a local HTTP stand-in
  (see `packages/server/src/llm/llm.test.ts`, `test/llm.test.mjs`), document it in README "AI providers".

## Security invariants (never break)

- **CSRF:** every state-changing request to `/api` or `/auth` without a bearer token must pass `isSameOrigin`
  (`packages/server/src/server.ts`). Session and keyring cookies are `HttpOnly` and `SameSite`.
- **Authentication everywhere** except `/assets`, `/licenses`, `/favicon.ico`, `/login.html` and the sign-in
  routes. A request with an `Authorization` header is judged by that header only (no fallback to the cookie).
- **Roles on the server, for every request:** `roleOf` before any project route; `none` answers 404 (ids cannot be
  probed); minimum role per action. The chat agent loop re-reads the role before every model call and every tool
  execution (`toolsForRole`, `toolRefusal` in `packages/server/src/chat/toolSpecs.ts`). Never trust the browser.
- **Access tokens** cannot create, list or revoke tokens, read or change AI keys, list provider models, or join
  share links (`viaToken` checks in `packages/server/src/llm/routes.ts`, `packages/server/src/chat/agentRoutes.ts`). On token
  requests the chat never sends the proxy's sign-in token to `identity` providers (the proxy may have signed in
  someone else), and turns that need a personal key are refused.
- **Personal AI keys** are encrypted (AES-256-GCM, key from `APP_SECRET` + browser keyring cookie), never stored
  in plaintext, logged or returned (only a hint), and redacted from error messages with `redact()`
  (`packages/server/src/llm/routes.ts`). The same applies to every credential and upstream token.
- **Claude Code CLI provider** (`CHAT_CLAUDE_CODE`) bills the account signed in on the server machine for every
  user: the config refuses it unless `AUTH=dev` (`configSchema` in `packages/server/src/config.ts`), and the CLI runs
  locked down (`packages/server/src/llm/claudeCodeCli.ts`). Never add a multi-user opt-in.
- **Bearer secrets** (session tokens, PATs, share link tokens) are stored only as SHA-256 hashes; the proxy secret
  is compared timing-safe.
- **CSP:** HTML pages get `PAGE_CSP` (`packages/server/src/http.ts`): scripts only from the app. Do not loosen it.
- **Trusted headers** are accepted only from a verified proxy (`AUTH_PROXY_SECRET` and/or `AUTH_TRUSTED_PROXIES`);
  the config refuses `trusted-headers` without one.
- **bpmn.io watermark** must stay fully visible and never overlapped (bpmn.io license): panels push the canvas
  aside, the canvas container is isolated (`packages/web/src/styles.css`). Applies to every new surface rendering a
  diagram.
- Defaults stay safe for a public deployment; `apps/standalone/src/main.ts` warns when `dev` auth listens beyond
  localhost.

## Testing expectations

- Before a PR: `pnpm typecheck`, `pnpm test` (unit + API on SQLite + browser) and `pnpm test:api:postgres` all pass.
- Tiers: unit (vitest, next to the code; storage-touching suites on SQLite and PGlite; browser modules in jsdom),
  black-box API (`test/`, real server process, temp data folder), Postgres API run (PGlite over the wire protocol),
  headless Chrome (`test/browser/`, last in `pnpm test`; skipped with `BROWSER TESTS SKIPPED` when no Chrome is
  found, so say in the PR whether it ran).
- Tests never call real providers or services: use local stand-ins (HTTP servers in the test, `oauth2-mock-server`
  for OIDC, PGlite for Postgres). No network, no real keys.
- New behaviour gets tests; security rules get negative tests (wrong role, token instead of session, foreign
  origin). Never weaken, skip or delete a test to make it pass; fix the code or ask.

## Workflow

- Work on a branch; one PR per task or phase. **Never** push to `main`, force-push or merge: a human merges.
- Never bypass hooks (`--no-verify`); if a hook blocks you, fix the cause.
- Update docs in the same PR (next section).
- When a decision is ambiguous and costly to get wrong (data model, security, public API, new dependency), stop
  and ask: give the options and a recommendation instead of guessing. Decide small things yourself and say so in the PR.

## Keeping this file current

Docs drift is a bug. Every PR checks:

- [ ] `AGENTS.md`: updated when adding/renaming a package, key directory or file, command or script, convention, env
  var category or security rule. Put paths in backticks (with a slash: repo-relative);
  `test/docs.test.mjs` fails on paths that do not exist and on `pnpm <script>` commands missing from
  `package.json`. Mention planned files without backticks. Keep it dense, under about 250 lines.
- [ ] `README.md`: updated for user-facing behaviour, env vars and API changes; `.env.example` for new env vars.
- [ ] `docs/redesign-plan.md`: updated when a phase's status or design changes (implementation notes per phase).
- [ ] `THIRD_PARTY_LICENSES.md`: regenerated when dependencies change.

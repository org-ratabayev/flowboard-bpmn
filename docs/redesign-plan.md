# Redesign plan: storage, access control, AI chat and MCP

Status: **proposed**, not implemented. This document is written so that an engineer or an LLM coding agent can
implement it phase by phase without further context. Each phase lists tasks, files and acceptance criteria.

## 0. Background

Today the app (see `README.md`) is a zero-dependency Node server (`server.js`, `live.js`) plus a vanilla-JS bpmn-js
frontend (`public/`). It has three structural limits:

1. **Storage** is one folder (`BPMN_DIR`) of plain files shared by everyone. No users, no ownership.
2. **No authentication or authorization.** Anyone with the URL can read, edit and delete every project.
3. **AI chat** shells out to a locally installed Claude Code CLI (`providers/claude-code.js`). It runs on the server
   owner's account, works only where the CLI is logged in, and is reachable by anyone with the link.

### Goals

- Multi-user: each user has their own projects. Users share **single documents** with other users as **viewer** or
  **editor**, and role changes (grant, upgrade, downgrade, revoke) take effect **live**, without a page reload.
- Pluggable **authentication**, **storage**, **LLM providers** and **MCP servers**.
- Expose the app as an **MCP server** (tools + MCP Apps views) so external agents can work with diagrams under the
  user's permissions.
- In-app chat can use **external MCP servers** from an admin-controlled registry.
- Everything deployment-specific (identity provider, LLM endpoint, extra MCP servers, hosting) is configuration or a
  plugin. A deployment uses the default entry point with a config file, or its own small package that imports the
  server. The app works end to end with defaults alone.

### Non-goals (for this plan)

- Real-time conflict-free merging (CRDT/OT). Live collaboration stays "whole diagram, last writer wins".
- A React rewrite of the editor UI.
- Hosting/deployment manifests for any specific platform (they belong to each deployment). The repository ships a
  generic Docker Compose file only.

## 1. Decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Extensibility | The server package exports `createServer(config)`. Deployments customize it through config and plugins, not by forking. |
| D2 | Authentication | Pluggable `AuthProvider`. Core ships `dev`, `trusted-headers` and `oidc`. Plus personal access tokens (PATs) for API/MCP clients. |
| D3 | Storage | Repository interface. Default **SQLite** (Node built-in `node:sqlite`, zero setup); **Postgres** adapter for multi-instance. |
| D4 | Language / packaging | TypeScript **pnpm workspace**. Core exports `createServer(config)`. |
| D5 | LLM | Pluggable `LlmProvider`: Anthropic (Claude), OpenAI-compatible gateway, and the existing Claude Code CLI (dev only). |
| D6 | MCP, expose | Core is an MCP server: diagram tools + MCP Apps views (browser, viewer). |
| D7 | MCP, consume | Chat is a generic MCP client. Registry comes from config only; core ships just its own BPMN server. Per-call approval, server-side tokens, OAuth 2.1 + PKCE. |
| D8 | Sharing model | Owner + per-user grants (`viewer` / `editor`) + optional share links + `everyone` visibility (readable by every signed-in user). |
| D9 | History | Every save is an immutable version, as today. Restore creates a new version. |

## 2. Rules for every phase

- Deployment-specific values (hostnames, client IDs, endpoints) are **config values** or **plugins**, never code.
  Docs, examples and test fixtures use `example.com`, `idp.example.com`, etc.
- Defaults must be safe for a public deployment (auth required except in `dev` mode, chat off unless a provider is
  configured, no external MCP servers).
- The bpmn.io license requires the "powered by bpmn.io" watermark to stay visible and never overlapped. This applies to
  every new surface that renders a diagram, including MCP Apps views and read-only viewers.

## 3. Target architecture

### 3.1 Repository layout

```
.
├── package.json                 # workspace root: scripts (dev, build, test, lint), engines
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml           # optional: Postgres for local multi-instance testing
├── .env.example                 # documented defaults
├── docs/
│   ├── redesign-plan.md         # this file
│   ├── configuration.md         # every config key, env var and plugin interface
│   └── extending.md             # plugins and custom deployments
├── packages/
│   ├── shared/                  # types, zod schemas, role logic, BPMN tool specs (used by server, web, mcp-apps)
│   ├── server/                  # HTTP API, auth, access control, storage, live, chat, MCP server + client
│   │   └── src/
│   │       ├── index.ts         # export { createServer, defineConfig, types }
│   │       ├── config/          # config schema + loader (.env + optional config module)
│   │       ├── auth/            # AuthProvider interface, dev / trusted-headers / oidc, sessions, PATs
│   │       ├── access/          # role resolution, middleware, grants, share links
│   │       ├── storage/         # repository interfaces, sqlite/, postgres/, migrations/, contract tests
│   │       ├── events/          # in-process bus; Postgres LISTEN/NOTIFY bridge
│   │       ├── live/            # SSE rooms (port of live.js)
│   │       ├── routes/          # REST routes
│   │       ├── chat/            # agent loop, sessions, browser tool bridge, providers/
│   │       ├── mcp-server/      # MCP endpoint, tools, MCP Apps resources
│   │       └── mcp-client/      # registry, connections, approvals, oauth/
│   ├── web/                     # current public/ moved here; vanilla JS/TS + bpmn-js, built with Vite
│   └── mcp-apps/                # single-file HTML views for MCP Apps hosts (bpmn-js NavigatedViewer)
├── apps/
│   └── standalone/              # default runnable: loads config, calls createServer(); `pnpm start`
├── examples/
│   └── custom-deployment/       # example: OIDC IdP, OpenAI-compatible endpoint, extra MCP server
└── scripts/                     # existing vendor/license scripts, import/export tools
```

The package scope is a placeholder: `@flowboard/*`. Rename in Phase 1 if a different public name is chosen.

### 3.2 Runtime

```
browser ──HTTP/SSE──▶ server (createServer)
                       ├─ AuthProvider ─▶ identity (user id, name, email, optional upstream token)
                       ├─ Access ─▶ role per document (owner/editor/viewer/none)
                       ├─ Storage (sqlite | postgres)
                       ├─ Live rooms (SSE)  ◀─▶ events bus (in-process | Postgres NOTIFY)
                       ├─ Chat ─▶ LlmProvider ─▶ tools: browser bridge + MCP client
                       └─ /mcp  ◀── external agents (PAT or upstream auth)
```

- Single process by default. With Postgres, several instances can run behind a load balancer; cross-instance events
  (live updates, role changes) go through Postgres `LISTEN/NOTIFY`. With SQLite, only one instance is supported.
- Node.js ≥ 22.13 (for unflagged `node:sqlite`); recommend Node 24 LTS. Declare in `engines`.

### 3.3 Libraries (recommended; keep the dependency list short)

| Need | Library |
|---|---|
| HTTP | `express@5` |
| Validation | `zod` |
| Postgres | `pg` |
| SQLite | `node:sqlite` (built in) |
| OIDC client | `openid-client` |
| MCP server + client | `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps` |
| Anthropic | `@anthropic-ai/sdk` (Messages API tool loop) or `@anthropic-ai/claude-agent-sdk` |
| OpenAI-compatible | `openai` (custom `baseURL`) |
| BPMN parsing server-side | `bpmn-moddle` (validate XML, read element ids/names) |
| Tests | `vitest`, `supertest` |
| Lint/format | `eslint` or `oxlint`, `prettier` or `oxfmt` |
| Frontend build | `vite` (+ `vite-plugin-singlefile` for mcp-apps) |

Browser libraries are npm dependencies of `packages/web`, bundled by Vite (decided in Phase 1; the earlier vendored
copies in `public/vendor/` were removed). `THIRD_PARTY_LICENSES.md` is generated from the installed packages.

## 4. Extension points

All interfaces live in `packages/server/src/*/types.ts` and are re-exported from `@flowboard/server`.

### 4.1 Configuration and custom deployments

```ts
// apps/standalone/src/main.ts (core default)
import { createServer, loadConfigFromEnv } from '@flowboard/server';
const server = await createServer(await loadConfigFromEnv());
await server.listen();

// a custom deployment (separate package)
import { createServer, defineConfig, oidcAuth, openAiCompatibleProvider } from '@flowboard/server';
export default defineConfig({
  publicOrigin: 'https://bpmn.example.com',
  auth: oidcAuth({ issuer: 'https://idp.example.com', clientId: process.env.OIDC_CLIENT_ID!, ... }),
  storage: { kind: 'postgres', url: process.env.DATABASE_URL! },
  llm: { providers: [openAiCompatibleProvider({ id: 'gateway', baseUrl: '...', token: { from: 'identity' } })] },
  mcp: { servers: [/* extra registry entries */] },
  branding: { appName: 'Process Modeler' },
});
```

- `loadConfigFromEnv()` reads `.env` + environment, and if `APP_CONFIG=/path/to/config.mjs` is set, imports that
  module and deep-merges its default export. A deployment can therefore use its own entry point or just a config file.
- The config is validated with zod at startup; invalid config fails fast with a readable message.
- Secrets are never logged. `GET /api/config` returns only the browser-safe subset (app name, enabled features, auth
  login URL, providers/models list without credentials).

### 4.2 `AuthProvider`

```ts
interface Identity {
  id: string;            // stable internal user id (users.id), assigned by the core
  provider: string;      // 'dev' | 'trusted-headers' | 'oidc' | custom
  subject: string;       // provider's stable subject
  name: string;
  email?: string;
  upstreamToken?: () => Promise<string | undefined>; // optional: token usable for LLM/MCP calls ("from: identity")
}
interface AuthProvider {
  id: string;
  authenticate(req): Promise<Omit<Identity, 'id'> | null>;   // null = anonymous
  routes?(router): void;          // e.g. /auth/login, /auth/callback, /auth/logout
  loginUrl?(returnTo: string): string;
}
```

Built-in providers:

- **`dev`**: everyone is `dev-user`, or the name from `?as=<name>` to simulate several users locally. Refuses to start
  unless `HOST` is loopback or `ALLOW_INSECURE_DEV_AUTH=true`. Logs a warning on every start.
- **`trusted-headers`**: reads identity from headers set by an authenticating reverse proxy. Header names are config
  (`subjectHeader`, `nameHeader`, `emailHeader`, `tokenHeader`). **Must** also verify that the request came through
  the proxy: either a shared secret header (`proxySecretHeader` + `proxySecret`) or a trusted source CIDR list.
  Without one of these it refuses to start, because anyone reaching the server directly could forge identities.
- **`oidc`**: authorization code flow + PKCE via `openid-client`; server-side session in the database, session id in
  an `HttpOnly; Secure; SameSite=Lax` cookie. Stores the access/refresh token server-side if `exposeUpstreamToken`
  is enabled (for LLM/MCP "from: identity" use), refreshing it when needed.

Common to all:

- On first sight of `(provider, subject)` the core creates a `users` row; it updates name/email on later logins.
- **Personal access tokens (PATs)** for MCP clients and scripts: created in the UI (`Settings → Access tokens`), shown
  once, stored as SHA-256 hashes, with name, optional expiry and last-used time. `Authorization: Bearer fb_pat_...`
  is accepted on `/api/*` and `/mcp`, on top of the active provider.
- **CSRF**: state-changing requests authenticated by cookie must carry a matching `Origin` header (exact match with
  `publicOrigin`). Requests with bearer tokens are exempt.
- Optional `UserDirectory` plugin: `search(query) → [{subject, name, email}]` for the share dialog. Default: search
  users who have already signed in.

### 4.3 Storage

Repository interfaces (one implementation per backend, both covered by **one shared contract test suite**):

- `UserRepo`, `SessionRepo`, `TokenRepo` (PATs)
- `DocumentRepo` (documents + versions)
- `AccessRepo` (grants, share links)
- `AuditRepo`
- `LiveStateRepo` (optional persistence of unsaved shared drafts, see 6.3)

Rules:

- Keep SQL portable (no JSON operators in hot paths, UUIDs generated in application code, timestamps as ISO strings
  in SQLite and `timestamptz` in Postgres). Each backend has its own `migrations/NNN_name.sql`; migration ids match.
- Migrations run at startup inside a transaction and are recorded in `schema_migrations`.
- Optimistic concurrency on saves: every save names the version it is based on; a mismatch returns `409`.

### 4.4 `LlmProvider`

```ts
interface LlmProvider {
  id: string;
  displayName: string;
  listModels(ctx): Promise<ModelInfo[]>;
  // One assistant turn with tool use. The core's agent loop calls this repeatedly until no tool calls remain.
  stream(ctx: { identity, model, system, messages, tools, signal }): AsyncIterable<LlmEvent>;
}
type LlmEvent =
  | { type: 'text-delta', text } | { type: 'thinking-delta', text }
  | { type: 'tool-call', id, name, input } | { type: 'usage', inputTokens, outputTokens, costUsd? }
  | { type: 'done', stopReason } | { type: 'error', message };
```

Built-ins:

- **`anthropic`**: Messages API with tool use and streaming. Credentials from config `apiKey`, or per-user key
  (see 7.6).
- **`openai-compatible`**: Chat Completions with tools against any `baseUrl`. Token source: `static` (env secret) or
  `identity` (the signed-in user's upstream token from the auth provider). This covers self-hosted and proxy LLM
  gateways.
- **`claude-code-cli`**: the current integration, adapted to the interface: runs `claude -p` with the same lock-down
  flags as today. Marked **dev-only**: enabled only when auth is `dev`, unless `allowInMultiUser: true` is set
  explicitly, because it bills one account for every user.

### 4.5 MCP registry entry (consume side)

```ts
interface McpServerEntry {
  id: string;                          // [a-z0-9-]+, also the tool-name prefix
  displayName: string;
  transport: 'streamable-http' | 'in-process';
  url?: string;                        // http(s) only; required for streamable-http
  auth:
    | { kind: 'none' }
    | { kind: 'static-header', header: string, secretEnv: string }
    | { kind: 'identity-token', header?: string }        // forwards the user's upstream token
    | { kind: 'oauth', scopes?: string[], clientName?: string }; // OAuth 2.1 + PKCE + discovery + DCR
  enabledByDefault: boolean;
  allowedTools?: string[];             // allowlist; default: all tools the server lists
  autoApproveTools?: string[];         // read-only tools that skip the approval prompt
  lifecycle: 'eager' | 'lazy';
  timeoutMs?: number;                  // default 15000
}
```

The core registry contains exactly one entry: `{ id: 'bpmn', transport: 'in-process' }`, the app's own MCP server.
Deployments add entries via config. Browsers can only refer to entries by `id`; they never send URLs, headers or tokens.

## 5. Data model

Types shown for Postgres; SQLite uses `TEXT`/`INTEGER` equivalents.

```sql
users(id uuid pk, provider text, subject text, name text, email text null,
      created_at timestamptz, last_seen_at timestamptz, unique(provider, subject))

sessions(id text pk /* random 32 bytes, hashed */, user_id uuid fk, created_at, expires_at,
         upstream_token_enc text null, upstream_refresh_enc text null)

access_tokens(id uuid pk, user_id uuid fk, name text, token_hash text unique,
              created_at, expires_at null, last_used_at null, revoked_at null)

documents(id uuid pk, name text, owner_id uuid fk users,
          visibility text check (visibility in ('private','everyone')) default 'private',
          current_version_id uuid null, created_at, updated_at, deleted_at null)

document_versions(id uuid pk, document_id uuid fk, seq integer /* 1,2,3… per document */,
                  xml text, author_id uuid fk null, author_name text, note text null,
                  source text check (source in ('editor','restore','import','mcp','ai')),
                  created_at, unique(document_id, seq))

document_grants(document_id uuid fk, user_id uuid fk, role text check (role in ('viewer','editor')),
                granted_by uuid fk, created_at, updated_at, primary key(document_id, user_id))

pending_grants(document_id uuid fk, email text, role text, granted_by uuid fk, created_at,
               primary key(document_id, email))   -- for people who have not signed in yet

share_links(id uuid pk, document_id uuid fk, token_hash text unique, role text,
            created_by uuid fk, created_at, expires_at null, revoked_at null)

audit_log(id uuid pk, document_id uuid null, actor_id uuid null, action text, details jsonb/text, created_at)

live_state(document_id uuid pk, rev integer, xml text, base_version_id uuid, updated_at)  -- optional, 6.3
```

Notes:

- `documents.owner_id` is the only owner. Ownership transfer is a later feature (out of scope).
- Delete is soft (`deleted_at`), purged after a configurable retention (default 30 days). Owners can restore from a
  "Trash" view.
- XML size limit: 20 MB per version (same as today's live limit), configurable.
- `pending_grants` turn into `document_grants` when a user with that email signs in for the first time.

## 6. Access control

### 6.1 Role resolution (single source of truth)

`packages/shared/src/roles.ts` defines `type Role = 'none' | 'viewer' | 'editor' | 'owner'` and an order.
`packages/server/src/access/resolveRole.ts`:

```
resolveRole(identity, document, shareLinkToken?) =
  max(
    identity.id == document.owner_id                ? owner  : none,
    grant(document.id, identity.id)?.role           ?? none,
    document.visibility == 'everyone' && identity   ? viewer : none,
    valid share link (not expired/revoked)          ? link.role : none,
  )
deleted documents: owner only (for restore); everyone else gets none.
```

Every document route uses one middleware: `requireRole('viewer' | 'editor' | 'owner')`. It loads the document,
resolves the role **on every request** (no long-lived caching), attaches `req.doc` and `req.role`, and returns
**404** (not 403) when the role is `none`, so document ids cannot be probed.

Share links: the token travels in the URL fragment (`#share=<token>`), the browser sends it as the
`X-Share-Token` header; the server stores only its hash. Opening a share link while signed in **does not** create a
grant; it only grants access for requests carrying the token. (An owner can convert it into a grant later.)
Anonymous access via share links is off by default (`allowAnonymousShareLinks: false`).

### 6.2 Permission matrix

| Action | viewer | editor | owner |
|---|:-:|:-:|:-:|
| Open, read latest, see live presence | ✅ | ✅ | ✅ |
| List/view/download versions, "what changed" | ✅ | ✅ | ✅ |
| Export SVG/PNG/.bpmn | ✅ | ✅ | ✅ |
| Live edits, save, restore version, auto-layout | ❌ | ✅ | ✅ |
| AI chat: ask questions (read-only tools) | ✅ | ✅ | ✅ |
| AI chat: edit diagram | ❌ | ✅ | ✅ |
| Rename | ❌ | ✅ | ✅ |
| Share (grants, links, visibility), delete, restore from trash | ❌ | ❌ | ✅ |

Open question Q3 asks whether viewers see author names in history; default is yes.

### 6.3 Live updates and live role changes

The SSE live channel (`live.js`) is ported to `packages/server/src/live/` with these changes:

- Rooms are keyed by document UUID. The stream requires authentication and at least `viewer`.
- `POST …/live` (cursor/selection/diagram updates) re-checks the role. Diagram updates need `editor`.
  Viewers may still send cursor/selection/presence.
- New SSE events:
  - `access` `{ role }`: sent to every connection of a user when their effective role on that document changes
    (grant created/updated/deleted, visibility change, link revoked, document deleted).
  - `access-revoked`: role became `none`; the server then closes that stream.
- Role changes are published on the events bus (`grant.changed {documentId, userId}`); each instance's live module
  recomputes the role for affected connections and emits `access`. With Postgres, the bus is backed by
  `LISTEN/NOTIFY` so all instances get it.
- Unsaved shared drafts are kept in memory as today. With Postgres and several instances, either enable sticky
  sessions per document or persist drafts in `live_state` (decide in Phase 5; default: `live_state` when
  `storage=postgres`).

Client behavior:

- `editor → viewer`: switch the editor to read-only mode in place (6.4). If the user had local, not-yet-broadcast
  changes, show a banner: "Your access changed to view-only. Download your unsent changes" (offers a .bpmn download).
- `viewer → editor`: enable editing in place and show a short toast.
- `access-revoked`: show a full-page notice with a link to the dashboard; clear the canvas.

### 6.4 Read-only mode in bpmn-js

Implement `packages/web/src/readOnly.ts` as a bpmn-js module that can be toggled at runtime without re-creating the
modeler:

- Block changes: `commandStack.canExecute` returns `false` while read-only (wrap via `eventBus.on('commandStack.*.canExecute', …)`).
- Hide palette, context pad, color picker and the "More ▾" edit actions; disable keyboard edit bindings
  (delete, copy/paste, undo/redo, direct editing).
- Properties panel: hide it, or render it with all inputs disabled (CSS `pointer-events: none` + `aria-disabled`).
- Token simulation, minimap, linting, history view and exports stay available.
- Acceptance: toggling twice returns to a fully working editor; undo history is preserved across toggles.

Client-side read-only is cosmetic. The server must reject every write from a viewer (6.1).

## 7. AI chat

### 7.1 Flow

```
browser ─POST /api/chat/:conversationId/prompt─▶ server agent loop ─▶ LlmProvider.stream()
   ▲                                                   │ tool-call
   │◀── SSE: text, tool_request, proposal, approval ───┤
   └── POST /tool-result, /approval ──────────────────▶ resolves tool → next turn
```

- The agent loop lives on the server (`packages/server/src/chat/agentLoop.ts`): it sends messages + tool specs to the
  provider, executes tool calls, appends results, and repeats until the model stops or `maxTurns` (default 20) is hit.
- Conversation state is in memory per `(user, document, conversationId)` with limits: max 8 sessions per user, 64
  total, idle eviction after 30 min, prompt text ≤ 64 KB, ≤ 3 attachments per message, ≤ 2 MB each, ≤ 6 MB total.
  Supported attachments: images, PDF, text/CSV/Markdown, `.bpmn` (as today).
- SSE events are numbered so a reconnecting browser can replay what it missed (keep the last N events per session).

### 7.2 Tools

Two kinds, described once in `packages/shared/src/toolSpecs.ts` (name, description, JSON schema):

**Browser tools** run in the user's editor, so changes go through bpmn-js `modeling` (undo works, live collaboration
broadcasts them). The server sends `tool_request` over SSE and waits up to 30 s for `POST /tool-result`.

| Tool | Role | Purpose |
|---|---|---|
| `bpmn_get_summary` | viewer | process list, element counts, element index (id, type, name, incoming/outgoing) |
| `bpmn_get_elements` | viewer | full properties of given ids |
| `bpmn_get_xml` | viewer | current XML (unsaved state included) |
| `bpmn_lint` | viewer | bpmnlint results |
| `bpmn_add_elements` / `bpmn_update_elements` / `bpmn_delete_elements` / `bpmn_connect` | editor | element-level edits via `modeling` |
| `bpmn_replace_xml` | editor | full replacement for large rewrites; server validates with `bpmn-moddle` first |
| `bpmn_auto_layout` | editor | run bpmn-auto-layout |
| `bpmn_export_svg` | viewer | SVG for the model to check its work visually (optional, image-capable models) |

**Server tools** come from the MCP client (section 9), including the in-process `bpmn` server (search other
diagrams, read versions).

Edits are applied as **one undoable proposal** per turn: the browser applies them, highlights changes with
bpmn-js-differ colors, and shows "Keep / Undo". Saving records `AI: <request>` as the version note (as today).
Viewers get only viewer-level tools; the server filters the tool list by the caller's current role on every turn.

### 7.3 System prompt and skill

Move the current `CHAT_SYSTEM_PROMPT` into `packages/server/src/chat/prompts/bpmn-assistant.md`: BPMN modeling rules,
"inspect before editing", "prefer the smallest edit", "verify with lint after non-trivial edits", "never invent
element ids", and how to use external MCP tools. Deployments may append text via `config.chat.systemPromptAppend`.

### 7.4 Providers and models

- `GET /api/chat/models` lists models of all configured providers; the user picks one per conversation.
- Default model is config (`chat.defaultModel`), e.g. `anthropic:claude-sonnet-...`.
- Token usage and (where known) cost are shown under each reply, as today.

### 7.5 Safety

- Tool outputs (including MCP results and attachments) are untrusted input. They are passed to the model as tool
  results, never as system instructions.
- Write tools always need the editor role, checked at execution time, not only when listing tools.
- The `claude-code-cli` provider keeps today's lock-down (`--restricted` to a temp folder, no shell, no web, no MCP,
  no user settings) and is dev-only by default (4.4).
- Rate limits per user: prompts per minute (default 10), concurrent turns (default 1 per conversation).

### 7.6 Who pays (configurable)

`chat.credentials`: `server` (one key from env, default), `identity` (user's upstream token, for gateways), or
`user-key` (each user stores their own provider key in Settings, encrypted with `APP_SECRET`). See Q2.

## 8. MCP server (expose)

Endpoint: `POST|GET|DELETE /mcp` using the official SDK's Streamable HTTP transport (stateless mode is sufficient).
Authentication: PAT (`Authorization: Bearer fb_pat_…`) or whatever the active `AuthProvider` accepts (e.g. trusted
headers behind a proxy). Every tool call resolves the role exactly like REST routes.

Example client config (Claude Code / Claude Desktop):

```json
{ "mcpServers": { "bpmn": { "type": "http", "url": "https://bpmn.example.com/mcp",
  "headers": { "Authorization": "Bearer fb_pat_..." } } } }
```

### 8.1 Tools

| Tool | Role | Notes |
|---|---|---|
| `list_diagrams` | – | filters: `scope` (mine / shared / everyone / all), `query`, `limit`, `offset`; returns id, name, role, updatedAt, url |
| `get_diagram` | viewer | XML + metadata + `versionId`; option `includeUnsaved` returns the live draft |
| `get_diagram_summary` | viewer | element index without full XML (cheaper for models) |
| `create_diagram` | – | name + optional XML (validated); returns id + editor URL |
| `update_diagram` | editor | full XML + `baseVersionId`; creates a version with `source='mcp'`; `409` if stale **or** if the document has unsaved live changes (the agent should tell the user to save first) |
| `rename_diagram` | editor | |
| `delete_diagram` | owner | soft delete |
| `list_versions` / `get_version` / `restore_version` | viewer / viewer / editor | |
| `export_diagram` | viewer | `.bpmn` text; SVG is produced by the MCP Apps viewer (no headless rendering on the server) |
| `share_diagram` / `list_shares` | owner | disabled unless `mcp.allowSharingTools: true` |

Saves through MCP are broadcast to open editors through the live channel, like a save from another browser.

### 8.2 MCP Apps views (`packages/mcp-apps`)

Single-file HTML documents (Vite + `vite-plugin-singlefile`), served as MCP resources with the MCP Apps MIME type
and linked from tools via `_meta.ui.resourceUri`:

| Resource | Linked from | What it shows |
|---|---|---|
| `ui://bpmn/diagram-browser` | `list_diagrams` | searchable list, thumbnails, "open in editor" |
| `ui://bpmn/diagram-viewer` | `get_diagram`, `create_diagram`, `update_diagram`, `get_version` | read-only bpmn-js NavigatedViewer with zoom/pan, "open in editor" link |

- Views get data from the tool result (no extra network calls with credentials from inside the host iframe).
- The bpmn.io watermark stays visible in both views.
- Built artifacts are copied into the server package at build time. In dev, the server reads them from
  `packages/mcp-apps/dist` so view changes don't need a server restart.

## 9. MCP client in chat (consume)

- `packages/server/src/mcp-client/registry.ts`: core entry `bpmn` (in-process) + `config.mcp.servers`. Validate at
  startup: unique ids, `https:` URLs (or `http:` only for loopback in dev), no credentials in URLs.
- Per chat session the user chooses which registry entries are enabled (default: `enabledByDefault`). The browser
  sends ids only.
- Connections are opened lazily (or eagerly per entry), with timeouts and capped result sizes (default 100 KB of
  text per tool result; larger results are truncated with a note).
- Tool names are namespaced `<serverId>__<toolName>`; only `allowedTools` are exposed.
- **Approval**: every external tool call sends an `approval` SSE event (server, tool, arguments) and waits for
  `allow once` / `allow for this session` / `deny` (timeout 2 min = deny). `autoApproveTools` skips the prompt.
- **Credentials** are injected server-side only:
  - `static-header`: value from the named env var.
  - `identity-token`: the user's upstream token from the auth provider.
  - `oauth`: OAuth 2.1 authorization code + PKCE with protected-resource metadata (RFC 9728), authorization-server
    metadata (RFC 8414) and dynamic client registration (RFC 7591). Routes: `GET /api/mcp-oauth/status`,
    `POST /api/mcp-oauth/:serverId/start`, `GET /mcp-oauth/:serverId/callback`, `POST …/disconnect`. The callback URI
    is built from `publicOrigin`. Access/refresh tokens, client registration and flow state are stored per
    `(user, serverId)` **encrypted with `APP_SECRET`** (AES-256-GCM) in the database, so they survive restarts and
    work across instances. Tokens never reach browser JavaScript.
- Users cannot add arbitrary MCP servers from the UI (prevents SSRF and data exfiltration through the server). Only
  admins via config.

## 10. Frontend changes (`packages/web`)

- Sign-in state from `GET /api/me`; sign-in/out buttons when the provider has a login flow.
- Dashboard tabs: **My diagrams**, **Shared with me**, **Everyone** (visibility `everyone`), **Trash**. Each card
  shows the user's role.
- Editor top bar: role badge (Owner / Can edit / Can view), **Share** button (owner only).
- Share dialog: add people (search via `UserDirectory`, or type an email → pending grant), role dropdown per person,
  remove, visibility toggle (private / everyone signed in), share links (create with role and expiry, copy, revoke).
- Read-only mode (6.4) and live access events (6.3).
- Settings page: access tokens (create/revoke), connected MCP servers (connect/disconnect), optional personal LLM key.
- Chat panel: model picker, MCP server toggles with connect buttons, approval prompts, proposal "Keep / Undo".
- The existing "Your name" field disappears; names come from the identity.
- Keep the layout rule: side panels push the canvas aside and never cover the bpmn.io watermark.

## 11. Migration from the current folder storage

`pnpm flowboard import --from <BPMN_DIR> --owner <subject> [--dry-run]`:

- Each project folder becomes a document owned by the given user; `project.json` gives name and `createdAt`.
- Every `history/*.bpmn` becomes a version in timestamp order; author names and notes come from `log.jsonl`
  (stored in `author_name`, `author_id` null); `source='import'`.
- Idempotent: re-running skips projects already imported (match on a stored `import_key`).

`pnpm flowboard export --to <dir>` writes the same folder layout back (latest file + `history/` + `log.jsonl`), so
users keep the "plain files, open in any BPMN tool" backup path.

## 12. Phases

Each phase ends with green `pnpm lint && pnpm typecheck && pnpm test`, updated docs (`README.md`,
`docs/configuration.md`) and a working `pnpm dev`. Phases 7 to 9 can run in parallel with phase 6.

### Phase 1: Workspace and TypeScript port (no behavior change)

Tasks:
1. Create the workspace layout (3.1): `packages/shared`, `packages/server`, `packages/web`, `apps/standalone`.
2. Port `server.js`, `live.js`, `providers/claude-code.js` to TypeScript in `packages/server`, keeping the file
   storage and every current endpoint unchanged. Expose `createServer(config)`.
3. Move `public/` to `packages/web`; build with Vite (or serve as-is first; bundling can follow).
4. Before porting, write characterization tests for the current API (projects, history, live, chat with a fake
   CLI). They are black-box HTTP tests (`node:test`, in `test/`) that start the server as a separate process, so they
   run unchanged against the old and the new server (`TEST_SERVER_CMD`). Unit tests for new code use vitest.
5. Config loader with zod (4.1); document every new setting in `.env.example`.

Acceptance: all characterization tests pass against the new server; the UI works as before; `pnpm start` runs.

### Phase 2: Storage layer

Tasks:
1. Repository interfaces (4.3) and the schema (5) as migrations for SQLite and Postgres.
2. Contract test suite run against both backends (Postgres via `docker compose up postgres` or Testcontainers; CI
   runs both).
3. Switch routes from files to `DocumentRepo`; versions replace `history/`.
4. `import` / `export` commands (11).
5. `docker-compose.yml` with Postgres for local multi-backend testing.

Acceptance: contract tests green on both backends; an imported `BPMN_DIR` shows the same projects and history as
before; export → import round-trips byte-identical XML.

Implementation notes (done):
- Tables `documents` and `document_versions` only. Users, sessions, tokens, grants, share links, audit and
  `live_state` are added by the migrations of the phases that use them (3–5).
- Document ids and version names keep the earlier formats (slug ids, timestamp version names) instead of UUIDs and
  `seq`-only versions, so existing links and the browser app work unchanged. `seq` orders versions internally.
  New documents can switch to random ids in Phase 4 without breaking existing ones.
- Postgres in tests is PGlite (in-process, wire protocol via pglite-socket) instead of Docker; it runs one session,
  so tests use a pool of one connection. `docker-compose.yml` is for trying a real Postgres locally.
- When the database is empty, project folders in `BPMN_DIR` are imported automatically on first start.

### Phase 3: Authentication

Tasks:
1. `AuthProvider` interface + `dev`, `trusted-headers`, `oidc` (4.2); `users`, `sessions`.
2. Auth middleware on every `/api/*` route and the SSE stream; `GET /api/me`; CSRF origin check.
3. PATs (`access_tokens`) + Settings UI.
4. Remove the "Your name" field; record `author_id` on saves.
5. Tests: each provider (OIDC against a mock IdP, e.g. `oauth2-mock-server`), header spoofing rejected without the
   proxy secret, PAT hashing/expiry/revocation, CSRF.

Acceptance: with `trusted-headers` or `oidc`, an unauthenticated request to any API route gets `401`; dev mode works
with `?as=alice` / `?as=bob` in two browser profiles.

Implementation notes (3a done; 3b OIDC and 3c PATs follow):
- `dev` sign-in is a small page where the user types a name (session cookie), not `?as=`; it replaces the "Your name"
  field and keeps names on a LAN board. Instead of refusing to start on a non-loopback host, the server prints a
  warning, so sharing on a trusted LAN keeps working; real protection is `trusted-headers` (and `oidc` in 3b).
- `trusted-headers` refuses to start without `proxySecret` or `trustedProxies`; with both set, both must match.
- Pages without a session redirect to `/auth/login?returnTo=…`; API calls answer `401`; assets, `/licenses` and the
  sign-in page stay public. The CSRF check covers every state-changing `/api` and `/auth` request.
- 3b (done): `oidc` with `openid-client` (code + PKCE, state, nonce); the one-time flow state is stored in the
  database (`auth_flows`) and tied to the browser by a cookie, so it works across instances. Discovery happens on the
  first sign-in. Optional `allowedEmailDomains`. Upstream access/refresh tokens are not stored yet; that comes with
  the features that call other services on the user's behalf (chat providers, MCP).
- 3c (done): personal access tokens (`fb_pat_…`, table `access_tokens`, SHA-256 hash + hint, expiry 30/90/365 days or
  none, revocation, last use recorded at most hourly, 50 active per user) and a Settings page. Token management needs a
  browser session. Any `Authorization` header on `/api` is treated as a token attempt (no cookie fallback); Bearer
  requests skip the Origin check. Rate limiting of token use is left for when the MCP server exists (Phase 7).

### Phase 4: Authorization and sharing

Tasks:
1. `resolveRole` + `requireRole` (6.1) on every document route; 404 for `none`.
2. Grants, pending grants, share links, visibility; owner-only share API:
   `GET/PUT/DELETE /api/documents/:id/grants/:userId`, `POST/DELETE /api/documents/:id/links`,
   `PATCH /api/documents/:id` (`visibility`).
3. Dashboard tabs and share dialog (10).
4. Audit log entries for share changes and deletes.
5. **Endpoint × role test matrix**: a table-driven test that calls every route as none/viewer/editor/owner/link and
   asserts the status code from 6.2. New routes must be added to the matrix (the test fails on unknown routes by
   enumerating the router).

Acceptance: matrix test green; user B sees only documents explicitly shared with them or `everyone` documents; ids of
other documents return 404.

Implementation notes (4a done; 4b share links, pending grants by email and audit log follow):
- Owner decisions: documents that existed before sharing belong to the first user who signed in (adopted at startup,
  after imports and when the first user is created); new and existing documents are private by default.
- Share API lives under `/api/projects/:id/access` (GET for anyone with access; PATCH visibility, PUT/DELETE
  `members/:userId` for the owner; users may remove their own grant). `GET /api/users?q=` searches signed-in users.
- Chat needs the editor role. Unsupported methods answer 405 before the role check.
- The matrix test lists the routes explicitly instead of enumerating the router (the router is hand-written).
- Viewers get a "View only" UI (no Save/Chat, no publishing or saving); the locked editor and live role changes are Phase 5.
- The share dialog is a panel without a full-page backdrop, so the bpmn.io watermark is never covered.
- 4b (done): share links, invitations by email and the audit log (migration `006_links_invites_audit`).
  **Deviation from 6.1:** opening a share link creates a grant marked with the link (`document_grants.link_id`)
  instead of authorizing each request that carries the token, because the live stream (`EventSource`) cannot send
  custom headers and links in every request URL would leak into logs. Revoking a link deletes the grants it created,
  which keeps "revoke the link, remove the access"; link expiry only limits joining. Joining is a POST from the
  `/s/<token>` page (signed-in users only; access tokens cannot join). Invitations use `pending_grants` and are
  accepted when a user signs in with that email; unverified OIDC emails are not kept, so they cannot claim them.
  The audit log covers creation, visibility, members, links, joins and invitations; the owner reads it in the dialog.

### Phase 5: Live collaboration on the new model + live role changes

Tasks:
1. Port rooms to document UUIDs; authenticate streams; role checks on live POSTs (6.3).
2. Events bus with in-process and Postgres `LISTEN/NOTIFY` implementations; publish `grant.changed`,
   `document.saved`, `document.deleted`.
3. `access` / `access-revoked` SSE events; client handling.
4. Read-only module for bpmn-js (6.4).
5. Multi-instance drafts: `live_state` for Postgres.

Acceptance (manual + automated): with two browsers (owner A, user B):
B gets view → canvas read-only; A upgrades to edit → B can edit within 1 s, no reload; A downgrades → B is
read-only within 1 s, with the unsent-changes banner if applicable; A revokes → B sees the revoked notice and the
stream closes; a viewer's forged live POST returns 403/404. With two server instances on Postgres, the same works
when A and B are connected to different instances.

Implementation notes (done):
- Rooms were already keyed by project id with authenticated streams and role checks (Phase 4a); ids stay slugs.
- Every live connection records its user and role. After any access change (member set/removed, visibility, link
  revoked, someone joining through a link, an invitation granted to a known user) the route publishes an access event;
  the live hub re-checks the role of everyone in that room and sends `access` or `access-revoked` (then closes the
  stream). `hello` carries the role too, so a change missed while disconnected is applied on reconnect.
- The event bus is in-process for SQLite; for Postgres it also uses `NOTIFY` on `flowboard_access` with a dedicated
  `LISTEN` connection (reconnecting with backoff; each instance ignores its own messages; `PG_LISTEN=off` turns it
  off). PGlite serves one session, so API tests run with it off; the cross-instance path is covered by unit tests with
  a fake connection. Not yet verified against a real multi-instance Postgres.
- Only access events cross instances. Live editing itself (cursors, unsaved shared drafts) still happens per instance:
  people on different instances do not see each other live until drafts are shared through the database or sticky
  sessions are used (`live_state`, task 5, is left for when several instances are actually deployed).
- Read-only editor: `packages/web/src/readOnly.mjs` blocks commands, undo/redo, editing drags (move, connect,
  resize, create, space tool), direct editing, context pad and popup menus, hides palette and context pad, and
  disables properties-panel inputs; it toggles at runtime without re-creating the modeler.

### Phase 6: LLM providers and the new chat

Tasks:
1. `LlmProvider` interface; `anthropic`, `openai-compatible`, `claude-code-cli` (4.4). A `fake` provider for tests
   that replays scripted tool calls.
2. Agent loop, session service with limits and replay (7.1), browser tool bridge (7.2), role-filtered tools.
3. Browser side: tool executors using bpmn-js `modeling`, proposal "Keep / Undo", diff highlighting.
4. Model picker; usage/cost display; rate limits.
5. Credentials modes (7.6).

Acceptance: with the fake provider, an end-to-end test adds a task between two elements through browser tools, the
change is undoable, and saving records `AI: …`; a viewer's chat cannot call edit tools (server rejects even if the
model asks); the CLI provider still works in dev mode.

### Phase 7: MCP server tools

Tasks:
1. `/mcp` with the official SDK (8); tools from 8.1 implemented on top of the same repositories and `resolveRole`.
2. PAT auth for `/mcp`; documentation with a client config example.
3. Live broadcast of MCP saves; `409` when stale or when unsaved live changes exist.
4. Tests with the SDK's client against the in-memory server; role matrix for tools.

Acceptance: Claude Code configured with a PAT can list, read, create and update diagrams; a viewer PAT cannot
update; an open editor shows the MCP update live.

### Phase 8: MCP Apps views

Tasks:
1. `packages/mcp-apps` with the two views (8.2); build to single-file HTML.
2. Register resources and `_meta.ui` links; dev hot reload from `dist/`.
3. Visual check in an MCP Apps-capable host; watermark visible.

Acceptance: in a host that supports MCP Apps, `list_diagrams` shows the browser view and `get_diagram` the viewer;
in hosts without MCP Apps, tools still return useful text/JSON.

### Phase 9: MCP client in chat

Tasks:
1. Registry + validation (9), in-process `bpmn` entry.
2. Connection manager (lazy/eager, timeouts, allowlist, namespacing, result caps).
3. Approval flow over SSE + UI.
4. Auth kinds: none, static-header, identity-token, oauth (discovery, DCR, PKCE, refresh, encrypted storage).
5. Settings UI for connected servers; chat toggles.
6. Tests against a local test MCP server (in-repo fixture) including an OAuth-protected one with a mock
   authorization server.

Acceptance: with an extra registry entry in config, a user can enable it in chat, log in via OAuth, approve a tool
call and see the result; denying blocks the call; tokens never appear in browser network responses; restart keeps
the connection.

### Phase 10: Documentation and example deployment

Tasks:
1. `docs/configuration.md` (every key), `docs/extending.md` (custom deployments: entry point vs config module,
   adding auth/LLM/MCP entries, deployment notes).
2. `examples/custom-deployment`: generic IdP, `openai-compatible` provider with `token: { from: 'identity' }`, one
   extra MCP server entry. Uses only `example.com` values.
3. Update `README.md`, `THIRD_PARTY_LICENSES.md` (re-run the audit script for new dependencies), security notes.

Acceptance: a new developer can follow README to run the core with SQLite in under 5 minutes, and follow
`docs/extending.md` to run the example deployment against a mock IdP.

## 13. Security checklist (verify at the end of phases 3, 4, 7 and 9)

- [ ] Every route and SSE stream authenticated (except `/health`, login/callback, static assets, `/licenses`).
- [ ] Role check on every document route and every MCP/chat tool execution; 404 on no access.
- [ ] `trusted-headers` requires proxy verification; direct requests with forged headers are rejected.
- [ ] CSRF: `Origin` check on cookie-authenticated state changes; `SameSite` cookies.
- [ ] Secrets only in env/config; never logged; `/api/config` exposes no secrets.
- [ ] Tokens (PATs, share links, sessions) stored hashed; upstream/OAuth tokens encrypted with `APP_SECRET`.
- [ ] XML validated with `bpmn-moddle`, size-limited; XML rendered only by bpmn-js (no HTML injection via names).
- [ ] Rate limits on chat, login and PAT use.
- [ ] MCP registry only from config; HTTPS URLs; tool allowlists; approvals for external tools.
- [ ] Tool outputs treated as untrusted; write tools re-check roles at execution time.

## 14. Testing strategy

- **Unit**: role resolution, config validation, token hashing/encryption, tool spec schemas.
- **Contract**: repository suite × {SQLite, Postgres}.
- **API**: supertest per route + the endpoint × role matrix.
- **Live**: SSE tests with two simulated clients; role-change propagation; two-instance test on Postgres.
- **Chat**: fake provider scripts; browser tool bridge with a headless bpmn-js (jsdom or Playwright).
- **MCP**: SDK client against the server; fixture MCP servers (plain + OAuth-protected) for the client side.
- **E2E** (Playwright): sign in as two users, share, upgrade/downgrade live, chat edit + undo.

## 15. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A route misses the access check | data exposure | single `requireRole` middleware; route-enumerating matrix test |
| `trusted-headers` deployed without a proxy | identity forgery | refuses to start without proxy verification |
| Whole-diagram last-writer-wins with more users | lost edits | keep save conflicts + history; consider CRDT later |
| MCP/AI edits while users have unsaved drafts | confusing overwrites | MCP update returns 409 when a live draft exists; AI edits go through the browser |
| Prompt injection via MCP results or attachments | unwanted edits/exfiltration | approvals, role checks at execution, no user-defined servers |
| Costs from LLM use | budget | provider credentials modes, per-user rate limits, usage display |
| SQLite in multi-instance setups | corruption/inconsistency | documented single-instance only; Postgres for scale |
| `node:sqlite` still marked experimental in some Node versions | API changes | thin adapter; pin Node version in `engines` |
| Large dependency growth vs. today's zero-dependency setup | supply-chain risk | short dependency list (3.3), lockfile, license audit, `pnpm audit` in CI |
| bpmn.io license (watermark) on new surfaces | license breach | checklist item in phases 6 and 8 |

## 16. Open questions (defaults used until answered)

| # | Question | Default |
|---|---|---|
| Q1 | Public product/package name and license (MIT vs. Apache-2.0)? | scope `@flowboard`, license undecided (must allow bundling MIT/ISC/Apache code and the bpmn.io license) |
| Q2 | Who pays for AI in multi-user mode: server key, user's upstream token, or personal keys? | `server` key, all three implemented |
| Q3 | Do viewers see version history including author names? | yes |
| Q4 | Allow anonymous (not signed-in) access via share links? | no |
| Q5 | Soft-delete retention period? | 30 days |
| Q6 | Should MCP clients be allowed to change sharing (`share_diagram`)? | no (config flag, off) |

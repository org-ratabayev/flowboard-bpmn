# Local BPMN editor

bpmn.io (bpmn-js 18.31.0) with saved projects, full version history and shareable links.
The server is written in TypeScript and runs directly on Node (no build step); the browser app is bundled with Vite.

## Run

Requires Node.js 22.18 or newer. Dependencies are installed with pnpm, which Node ships through Corepack:

```sh
corepack enable                 # once, makes `pnpm` available
pnpm install
pnpm start
PORT=8080 pnpm start            # different port
BPMN_DIR=~/somewhere pnpm start # different storage folder
```

Open http://localhost:3000. The startup log also prints your network address(es) for sharing on the LAN.

For machine-specific settings (storage folder, port, chat options), copy `.env.example` to `.env` and edit it.
`.env` is git-ignored; variables set in the environment override it.

Settings can also come from a JavaScript module named by `APP_CONFIG`, whose default export is a configuration object
(see `packages/server/src/config.ts` for all keys). Priority, highest first: environment variables, the `APP_CONFIG`
module, built-in defaults.

## Code layout

| Path | What |
|---|---|
| `packages/server/` | The server as a library: `createServer(config)`, config loading, storage, live collaboration, chat |
| `packages/web/` | The browser app: pages, `src/` (scripts, styles); built into `dist/`, which it exports as `publicDir` |
| `apps/standalone/` | The default entry point (`pnpm start`): reads `.env`, the environment and `APP_CONFIG` |
| `test/` | Black-box HTTP tests |

**Contributing / for agents:** start with [`AGENTS.md`](AGENTS.md): repo map, commands, conventions, security rules
and the checklist for keeping the docs current.

## Tests

```sh
pnpm test        # unit tests, then the HTTP API tests, then the browser check
pnpm typecheck
```

- `pnpm test:unit` runs vitest on the `*.test.ts` files next to the code and on the browser modules'
  `packages/web/src/**/*.test.mjs` (in jsdom: everything that needs no rendering).
- `pnpm test:api` runs the tests in `test/`, which check the HTTP API from the outside: each test file starts the
  server as a separate process with a temporary storage folder and a fake Claude CLI (`test/fixtures/fake-claude.mjs`),
  so they never touch your projects or call Claude. `TEST_SERVER_CMD` runs them against a different server command,
  e.g. `TEST_SERVER_CMD="node other/server.js" pnpm test:api`.
- `pnpm test:browser` opens the editor in headless Chrome and runs the AI chat end to end (prompt → tool calls →
  proposal → Keep / Undo → save) against a local stand-in for the AI provider (`test/browser/chat-flow.mjs`).
  `pnpm test` runs it last, only after everything else passed. Without Chrome or Chromium it prints
  `BROWSER TESTS SKIPPED` and succeeds; `CHROME_BIN` tells it where Chrome is.
- `pnpm test:api:postgres` runs the same API tests with Postgres storage. Storage tests run on both SQLite and
  Postgres. Postgres in tests is PGlite (Postgres compiled to WebAssembly, in-process), so no database server or
  Docker is needed.

New dependencies must be published at least 14 days before they are installed (`minimumReleaseAge` in
`pnpm-workspace.yaml`).

## Storage

Projects and every saved version are stored in a database:

- **SQLite** (default): one file, `flowboard.sqlite` in the data folder `BPMN_DIR` (default `~/workspace/bpmn-diagrams/`),
  or wherever `SQLITE_PATH` points. Nothing to install; back it up by copying the file while the server is stopped.
- **Postgres**: set `DATABASE_URL=postgres://user:password@host:5432/db`. Use it to run several server instances or to
  use managed backups. `docker compose up -d` starts a local Postgres for trying it
  (`DATABASE_URL=postgres://flowboard:flowboard@localhost:5432/flowboard`).

The schema is created and upgraded automatically at startup.

### Project folders (import and export)

Earlier versions stored projects as plain files. That layout is still supported for import and export:

```
bpmn-diagrams/
  order-flow/
    order-flow.bpmn                       <- latest version, open in Camunda Modeler / demo.bpmn.io / any BPMN tool
    project.json                          <- display name, creation date
    history/
      2026-11-05T12-35-39-675Z.bpmn       <- every saved version (UTC timestamp)
      log.jsonl                           <- who saved each version, and notes
```

- **First start:** when the database has no projects yet, the project folders found in `BPMN_DIR` are imported with
  their full history, and their ids stay the same, so existing links keep working. The folders are only read, never
  changed; later saves go to the database only. Set `IMPORT_ON_FIRST_START=off` to skip this.
- `pnpm flowboard import --from <folder> [--dry-run]` imports project folders at any time. Projects imported before
  are skipped. A latest file that was edited outside the app after its last saved version becomes one more version.
- `pnpm flowboard export --to <folder>` writes every project in this layout, e.g. to open them in other BPMN tools or as
  a plain-file backup. The target folder must be empty or not exist yet.

The commands use the same settings as the server (`.env`, environment variables).

## Features

- Project list with create and import of existing `.bpmn` files.
- Save with the button or Ctrl/Cmd+S. Each save is a new history entry.
- History panel lets you view any version, download it, or restore it (restoring adds a new version; nothing is ever overwritten).
- Every save records who made it (the signed-in user).
- **Live collaboration** (like Miro): everyone on the same project sees each other's cursors with names, what they
  selected (colored outline), and every change within about a quarter second. Avatars in the top bar show who is on the
  board (green dot = editing, faded = away, dashed = viewing an old version); click one to jump to that person.
  Unsaved changes are shared: anyone who opens the link sees them, and anyone's Save marks the board saved for all.
  Limits: changes are shared as whole diagrams, so if two people change something at the same moment the later one
  wins; receiving someone's change clears your undo history; others see a drag once it is dropped. Shared unsaved
  changes live in server memory, so save before restarting the server.
- If someone saved while you were offline or editing an old version, Save offers to load theirs or save yours on top.
  Both stay in history.
- **What changed**: in History, "what changed" highlights elements added (green), changed (orange) and moved (blue)
  compared to the previous version, and lists removed elements (bpmn-js-differ).
- **Properties panel** (right side, toggle with "Properties"): edit IDs, names, documentation, etc.
- **Color picker**: select elements → paint-bucket icon in the context pad.
- **Linting**: toggle the issues button bottom-left of the canvas; checks the bpmnlint "recommended" rules.
- **Token simulation**: toggle top-left of the canvas (or press `T`) to animate tokens through the process.
- **Minimap**: toggle top-right of the canvas.
- **More ▾** menu: download `.bpmn`, export SVG / PNG, auto-layout the diagram.
  Files without diagram layout (pure process XML) get a layout generated automatically when opened.

## AI assistant (chat)

The **Chat** button opens a panel where you can ask an AI model about the diagram or have it change it. It uses
the providers of the server's catalog (see [AI providers](#ai-providers)); in the default `personal` mode, add your
own API key under **Settings → AI providers** first, and the panel points you there until one is ready.

- **Conversations** are kept per user and diagram and are private. Pick one in the panel's list; **New**,
  **Rename** and **Delete** manage them.
- **Model picker** next to Send: the models of each provider that is ready for you. For providers without a fixed
  list, the server asks the provider (chat models only); if that fails, choose "Other model…" and type a name.
- **Replies stream in**; **Stop** cancels the answer. Token use (and the cost, when the provider reports it) is shown
  under each reply.
- **Attach…** adds up to 3 text files (plain text, CSV, Markdown, `.bpmn`; 2 MB each, 6 MB together), sent along
  with the message. Images and PDFs are not supported yet.
- **The assistant edits the diagram in your editor**, through the same commands as manual edits: they can be undone
  and reach live collaborators as unsaved changes. All its edits of one message form one **proposal**: the changed
  elements are highlighted (added green, changed orange, moved blue), and the reply and the top banner offer
  **Keep** or **Undo**. Undo asks first if the diagram was changed after the assistant's edits. Sending the next
  message or saving keeps an open proposal.
- **Version note:** the assistant describes its edits for the history (a short title and a few points, in plain
  language however the request was worded). Saving after AI changes opens the note for you to check or edit,
  e.g. `AI: Add review step before shipping` with the points below it; the notes of several AI messages before one
  save are combined, and edits the assistant did not describe are listed from the diagram changes. Your messages
  themselves stay in your private chat history and are never written into the version history.
- **Viewers** can chat too, but the assistant only reads the diagram for them.

**Claude Code CLI (development only).** With `AUTH=dev` and `CHAT_CLAUDE_CODE=on`, the catalog also offers the local
Claude Code CLI (`claude -p`) as a provider: it works on a copy of the diagram in a temp folder below
`$TMPDIR/bpmn-chat/` and hands a changed diagram to the editor as a proposal. It bills the Claude account signed in
on the server machine for every user, so the server refuses to start with it under any other sign-in. The CLI runs
locked down: only the Read/Edit/Write/Glob/Grep tools, confined to that folder (`--restricted`); no shell, web
access, MCP servers/connectors (`--strict-mcp-config`), user hooks or settings; anything needing a permission
prompt is denied. Earlier messages are sent along as text (no CLI session is kept).

| Env var | Default | |
|---|---|---|
| `CHAT` | on | `CHAT=off` turns the chat off |
| `CHAT_CLAUDE_CODE` | off | `on` offers the Claude Code CLI as a provider (needs `AUTH=dev`) |
| `CLAUDE_BIN` | `claude` | path to the Claude Code CLI |
| `CLAUDE_MODEL` | CLI default | default model of the CLI provider, e.g. `sonnet`, `opus` |
| `CHAT_TIMEOUT_MS` | 300000 | how long one CLI call may take |

The provider lives in `packages/server/src/llm/claudeCodeCli.ts`, next to the other `LlmProvider`s.

## AI providers

The server decides which AI providers users may use; users cannot add providers or URLs of their own. There are
two modes:

- **`personal`** (default): every user brings their own API key, saved under **Settings → AI providers**. The default
  list offers Anthropic and OpenAI. The server pays for nothing.
- **`managed`**: the organization configures the providers and their credentials, and users cannot add keys.

| Env var | Default | |
|---|---|---|
| `LLM_MODE` | `personal` | `personal` or `managed` |
| `LLM_PROVIDERS` | Anthropic + OpenAI (personal), none (managed) | JSON list replacing the default list, see below |
| `APP_SECRET` | generated (SQLite only) | 32+ characters; protects personal keys, see below |
| `AUTH_TOKEN_HEADER` | – | with `trusted-headers`: header in which the proxy forwards the user's access token |

Each entry of `LLM_PROVIDERS` (or `llm.providers` in an `APP_CONFIG` module):

```json
[
  { "id": "gateway", "label": "Company models", "type": "openai-compatible", "baseUrl": "https://llm.example.com/v1",
    "models": ["large", "small"], "defaultModel": "large", "credentials": { "from": "identity" },
    "headers": { "x-app": "flowboard" }, "userIdHeader": "x-user-id" }
]
```

- `type`: `anthropic` (Messages API) or `openai-compatible` (Chat Completions; needs `baseUrl`).
- `credentials.from`:
  - `user-key`: the user's own key (the only kind allowed in `personal` mode);
  - `server`: one key for everyone, read from the environment variable named in `secretEnv` (the key itself never
    appears in the configuration);
  - `identity`: the signed-in user's access token, sent as `Authorization: Bearer`. For gateways that bill or limit
    per user. With `trusted-headers`, the proxy forwards it in `AUTH_TOKEN_HEADER`; it is only read from requests the
    proxy has authenticated;
  - `adapter`: a function in an `APP_CONFIG` module that returns the credentials per request
    (`({ user, upstreamToken, providerId }) => ({ apiKey } | { bearer, headers } | null)`), for example to exchange
    the user's token for a provider token.
- `userIdHeader`: also send the user's subject in this header.

`GET /api/llm/providers` lists the providers with whether each is ready for the current user; it never returns keys,
tokens or provider URLs. `GET /api/llm/providers/:id/models` lists a provider's models: its fixed list, or else the
chat models the provider reports (embedding, speech, image and moderation models are left out). It uses the user's
own key for that one request and is refused with access tokens.

**How personal keys are kept.** A key is checked with the provider before it is saved, then encrypted (AES-256-GCM)
with a key derived from two halves: `APP_SECRET` on the server and a random secret in an `HttpOnly`,
`SameSite=Strict` cookie (`flowboard_keyring`) in the user's browser. The database alone, the server alone, or the
cookie alone cannot decrypt it. So a key saved in one browser cannot be used from another (save it there too), and
**signing out deletes the keys of that browser**. Keys unused for a year are deleted. Settings shows only a hint
(`sk-ant-…ab12`) and when the key was last used, and provider error messages are scrubbed of the key. Access tokens
cannot read, add or remove AI keys. Tip for users: create a separate key for this app with a spending limit.

**`APP_SECRET`.** Required with Postgres (all instances must share it; generate one with `openssl rand -base64 48`).
With SQLite and no `APP_SECRET`, the server generates one into `<BPMN_DIR>/app-secret` (mode 600) and warns at
start. Back it up separately from the database: without it, saved keys cannot be decrypted (users then just save
them again). Changing it has the same effect. Not needed in `managed` mode without `user-key` providers.

**Pages are served with a strict Content Security Policy** (scripts only from the app itself, no inline scripts, no
framing), so an injected script cannot run in the page that handles keys. Plugins must therefore load their scripts
as files, not inline.

## Chat API

The server runs the assistant itself (an "agent loop"): it sends the conversation and the editor tools to the
provider, streams the reply, has the user's browser run the tools the model calls, and repeats until the model is
done. Conversations are stored in the database per user and document; they are private (even the document owner
cannot read other people's conversations). Everyone with at least view access to a document can chat about it.

All routes are below `/api/projects/:id/chat/`:

| Route | |
|---|---|
| `GET conversations` | your conversations about this document, latest first |
| `POST conversations` `{ providerId?, model?, title? }` | defaults: the first provider of the catalog and its default model |
| `GET conversations/:cid` | the conversation with its `messages` (content blocks: `text`, `tool_use`, `tool_result`) and latest `turns` |
| `PATCH conversations/:cid` `{ title?, providerId?, model? }` | rename it or switch the model |
| `DELETE conversations/:cid` | delete it (a running turn stops) |
| `POST conversations/:cid/turns` `{ message, attachments? }` | send a message; the response is an event stream (below) |
| `POST conversations/:cid/tool-results` `{ turnId, toolCallId, content, isError? }` | the browser's result of a tool call |
| `POST conversations/:cid/turns/:turnId/cancel` | stop a running turn |

The turn's event stream (`text/event-stream`, numbered events) sends `turn { turnId }`, then `text { text }` as the
reply is written, `tool_request { turnId, id, name, input }` for each tool the browser must run,
`tool_result { id, name, status }` when a call finished (`done`, `error`, `timeout`, or `refused` when the user may
not run it), `usage { inputTokens, outputTokens, costUsd? }` per model call (`costUsd` only from providers that
report it), and finally one of `done { stopReason, usage }`, `cancelled` or `error { message }`.

`attachments` is a list of up to 3 text files `{ name, text }` (`.txt`, `.csv`, `.md`, `.markdown`, `.bpmn`; 2 MB each,
6 MB together). Each is added to the message as a text block `<attachment name="…">…</attachment>`.

**Tools.** The browser tools (`packages/server/src/chat/toolSpecs.ts`) read the open diagram (`bpmn_get_summary`,
`bpmn_get_elements`, `bpmn_get_xml`, `bpmn_lint`, `bpmn_export_svg`) or change it (`bpmn_add_elements`,
`bpmn_update_elements`, `bpmn_delete_elements`, `bpmn_connect`, `bpmn_replace_xml`, `bpmn_auto_layout`), and
`bpmn_summarize_changes { title, details[] }` records the version note for its edits (offered with the edit tools;
the system prompt asks for it once per message that changed the diagram). The editor runs them
(`packages/web/src/chat/`): edits go through bpmn-js `modeling`, `bpmn_replace_xml` is checked with the editor's
BPMN parser first (no unknown elements, duplicate ids or broken references), `bpmn_lint` uses the editor's bpmnlint
rules, and `bpmn_auto_layout` (bpmn-auto-layout, diagrams without pools and lanes) moves the existing elements. The
server
reads the user's role again before each model call and each tool call: viewers are offered only the read tools, and
an edit tool is refused even when the model calls it. A role change applies within the running turn. The browser has
`CHAT_TOOL_TIMEOUT_MS` (30 s) to answer a tool call; otherwise the model is told that the editor did not answer.

**Limits.** One running turn per conversation (`409` otherwise), at most 8 running turns per user (`429`), at most
`CHAT_TURNS_PER_MINUTE` (10) messages per user and minute across all instances (`429` with `code: 'rate-limited'`
and `Retry-After`), messages up to 64 KB, at most 20 model calls per turn, tool results up to 2 MB. Closing the request (the tab) cancels the turn and
the provider request. Conversations without activity for `CHAT_IDLE_DAYS` (30) are deleted.

**Keys.** For a provider with personal keys, the key is decrypted for the one turn with the browser's keyring cookie,
used for the provider requests of that turn and never stored, logged or returned. So personal keys work only from the
browser that saved them. **Access tokens** can use the chat API with providers that have server-side credentials
(`server`, `adapter`); turns with personal keys are refused (`403`), and `identity` providers do not get the sign-in
token on token requests.

**System prompt.** `packages/server/src/chat/prompts/bpmn-assistant.md`; deployments can append their own text with
`CHAT_SYSTEM_PROMPT_APPEND` (or `chat.systemPromptAppend` in an `APP_CONFIG` module).

**Several server instances.** A turn runs on the instance that received its request and streams from there; no
sticky sessions are needed. Tool results and cancels may reach any instance: it stores them in the database and
publishes the conversation id on the event bus (Postgres `NOTIFY` on `flowboard_chat`), which wakes the instance
running the turn; it also checks the database every 2 s in case a notification was lost. A running turn records a
heartbeat; turns of an instance that stopped (no heartbeat for a minute) are marked failed.

| Env var | Default | |
|---|---|---|
| `CHAT_TOOL_TIMEOUT_MS` | 30000 | how long the browser has to run a tool |
| `CHAT_IDLE_DAYS` | 30 | conversations without activity are deleted after this many days |
| `CHAT_SYSTEM_PROMPT_APPEND` | – | text added to the assistant's system prompt |
| `CHAT_TURNS_PER_MINUTE` | 10 | messages one user may send per minute; `0` turns the limit off |

`CHAT=off` turns off this API. The former `POST /api/projects/:id/chat` (Claude Code CLI only) is gone; the CLI is
now a provider of this API (see [AI assistant](#ai-assistant-chat)).

## Plugins and upgrading

The browser libraries are npm dependencies of `packages/web` (exact versions in `packages/web/package.json`), bundled
by Vite into `packages/web/dist/` (`pnpm build`; `pnpm start` builds first).

| Plugin | Version |
|---|---|
| bpmn-js (+ diagram-js 15.28.1) | 18.31.0 |
| bpmn-js-color-picker | 0.7.2 |
| bpmn-js-properties-panel (+ @bpmn-io/properties-panel 3.58.1) | 5.65.3 |
| bpmn-js-differ | 3.2.0 |
| bpmn-js-bpmnlint / bpmnlint | 0.25.0 / 12.0.0 (rules wired up in `packages/web/src/lint-config.mjs`) |
| bpmn-js-token-simulation | 1.1.0 |
| diagram-js-minimap | 5.6.0 |
| bpmn-auto-layout | 1.3.0 |

To upgrade, change the version in `packages/web/package.json`, run `pnpm install`, `pnpm test` and `pnpm license-list`,
and check the editor in a browser.

## Licenses

The app bundles third-party code, mostly MIT, plus ISC, Apache-2.0 (htm), CC0 (randomcolor) and bpmn-js under the
bpmn.io license. There's no GPL/AGPL code. The full list with license texts is in `THIRD_PARTY_LICENSES.md`, shown
in the app at `/licenses` (linked from the project list and the editor's More menu).

After changing dependencies, run `pnpm license-list` to regenerate the list from the installed packages.

**bpmn.io watermark:** the bpmn.io license requires that the "powered by bpmn.io" watermark in the canvas corner is
not removed or changed, and stays fully visible and never overlapped by other elements. The layout keeps it that way:
side panels push the canvas aside (or below it on narrow screens) instead of covering it, and the canvas container is
isolated (`packages/web/src/styles.css`) so UI drawn inside the canvas stays below the watermark. Keep this in mind for new UI.

## Sign-in

Every page and API call needs a signed-in user; the name is shown to others on the board and recorded with each
save. Sessions are HttpOnly cookies (only a hash of the token is stored) and last `SESSION_DAYS` (30). Requests that
change data must come from the app itself (`Origin` check), which blocks cross-site request forgery.

| `AUTH` | How users sign in | Use it |
|---|---|---|
| `dev` (default) | Type a name; no password | On your machine or a trusted network. Anyone who can reach the server can sign in as anyone; the server warns at startup when it listens beyond localhost. |
| `trusted-headers` | A reverse proxy in front of the app signs users in (SSO) and passes the user in headers | Shared deployments behind such a proxy. |
| `oidc` | The app signs users in with an OpenID Connect provider (Google, Microsoft Entra ID, Okta, Keycloak, …) | Shared deployments without such a proxy. |

### OpenID Connect

Register the app with your provider as a web application with the redirect URI `<PUBLIC_ORIGIN>/auth/callback`, then set:

```sh
AUTH=oidc
PUBLIC_ORIGIN=https://bpmn.example.com
OIDC_ISSUER=https://idp.example.com          # its /.well-known/openid-configuration must be reachable
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...                        # omit for a public client
# OIDC_SCOPES=openid profile email
# OIDC_ALLOWED_DOMAINS=example.com            # only verified emails of these domains may sign in
```

Sign-in uses the authorization code flow with PKCE, state and nonce; the ID token is verified before a session
starts. The provider is contacted on the first sign-in, so the server starts even while it is unreachable. Signing
out ends the session in this app only, not at the provider.

### Access tokens (API clients)

Scripts and tools such as MCP clients use personal access tokens instead of a browser session. Create one under
**Settings** (click your name at the top); it is shown once. Then send it with each API request:

```sh
curl -H "Authorization: Bearer fb_pat_…" https://bpmn.example.com/api/projects
```

A token acts as the user who created it. Only a hash is stored; tokens can expire (30/90/365 days or never) and be
revoked at any time, and the list shows when each was last used. Tokens cannot create, list or revoke tokens: that
needs a browser session, so a leaked token cannot hide or extend itself. When a request carries an `Authorization`
header, only that header counts: an invalid token is refused even if the browser also has a session cookie. A proxy
in front of the app must therefore pass `Authorization` through unchanged and not add its own.

### Behind a proxy (trusted headers)

For `trusted-headers`, the proxy must prove that the request came through it, otherwise anyone reaching the server
directly could send any identity. Set at least one of:

- `AUTH_PROXY_SECRET`: a secret (16+ characters) the proxy sends in `AUTH_PROXY_SECRET_HEADER` (default `x-proxy-secret`);
- `AUTH_TRUSTED_PROXIES`: comma-separated IPs or CIDR ranges the proxy connects from.

The user comes from `AUTH_SUBJECT_HEADER` (default `x-forwarded-user`); the optional `AUTH_NAME_HEADER` and
`AUTH_EMAIL_HEADER` give the display name and email. Behind any proxy that terminates TLS, set `PUBLIC_ORIGIN`
(e.g. `https://bpmn.example.com`) so cookies are marked Secure and the `Origin` check uses the public address.

## Projects and sharing

Every project has an **owner**. New projects are **private**: only their owner sees them until they share them with
**Share** in the editor:

| Role | Can |
|---|---|
| Owner | everything below, plus change who has access |
| Can edit | open, save, rename, restore versions, edit live with others, use the chat |
| Can view | open, see the history, download and export, see others live |

- Add people by name or email (people appear after they signed in once) and pick *Can edit* or *Can view*.
- **Invite by email** someone who has not signed in yet: they get access the first time they sign in with that
  email. This needs a sign-in method that provides verified emails (`oidc`, or `trusted-headers` with
  `AUTH_EMAIL_HEADER`); `dev` sign-in has no emails.
- **Share links** (`/s/…`): anyone who opens one and signs in joins with its role (*Can view* or *Can edit*). A link
  is shown once; it can be limited to 7 or 30 days for joining, and revoking it removes everyone who joined through
  it. Opening a link never lowers access someone already has. If the owner changes the role of someone who joined
  through a link, they no longer depend on it.
- *General access → Everyone signed in can view* makes a project readable by every signed-in user.
- Anyone with access sees who else has it and can remove their own access.
- **Activity** in the Share dialog lists every access change (who did what, when) to the owner.
- Projects that existed before sharing (including folders imported on first start) belong to the **first user who
  signed in**, and are private as well.
- Someone without access gets "Project not found", the same as for a project that does not exist.
- The project list shows your role on each project and filters *My projects* / *Shared with me*.

Viewers get a read-only editor (*View only*): no palette, context pad, dragging, text or property editing, undo or
keyboard edits, but selecting, zooming, the minimap, token simulation, linting, history and exports work.

Access changes apply to open editors at once, without reloading: when the owner raises or lowers someone's role,
their editor unlocks or locks (a lowered editor with unsaved changes is offered to download them); when access is
removed (also by revoking a share link or closing general access), their editor is replaced by a notice. With several
server instances on Postgres, the change reaches every instance through `LISTEN`/`NOTIFY` (this needs one extra
database connection per instance; `PG_LISTEN=off` disables it).

## Sharing outside your network

Each project is visible only to its owner and the people it is shared with. With `AUTH=dev` anyone who can open the
URL can sign in under any name, though, including the owner's, so only share a tunnel with people you trust, or use
`AUTH=oidc` / an authenticating proxy.

Easiest option: a Cloudflare quick tunnel (no account needed):

```sh
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://<random>.trycloudflare.com` URL. Share `https://<random>.trycloudflare.com/p/<project-id>`.
The URL changes every time you restart the tunnel.

Alternatives: `ngrok http 3000`, or `tailscale funnel 3000` (stable URL), or router port-forwarding to your machine's IP.

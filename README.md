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

## Tests

```sh
pnpm test        # unit tests, then the HTTP API tests
pnpm typecheck
```

- `pnpm test:unit` runs vitest on the `*.test.ts` files next to the code.
- `pnpm test:api` runs the tests in `test/`, which check the HTTP API from the outside: each test file starts the
  server as a separate process with a temporary storage folder and a fake Claude CLI (`test/fixtures/fake-claude.mjs`),
  so they never touch your projects or call Claude. `TEST_SERVER_CMD` runs them against a different server command,
  e.g. `TEST_SERVER_CMD="node other/server.js" pnpm test:api`.
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

## Chat with Claude

The **Chat** button opens a panel where you can ask Claude to change the diagram and attach files
(PDF, images, text, CSV, Markdown, `.bpmn`) for context. Word/Excel files are not readable yet; export them as PDF.

- Under the hood the server runs your local Claude Code CLI (`claude -p`) in a temp folder per conversation
  (`$TMPDIR/bpmn-chat/<chat-id>/`) holding `diagram.bpmn` (the editor's current state) and `attachments/`.
  Follow-up messages continue the same Claude session.
- Claude's modified diagram is applied as an **unsaved** change with an "undo" link; saving records
  `AI: <your request>` in the history.
- It uses your Claude account, and each message costs money (shown under each reply, typically $0.05–0.20).

**Safety:** every signed-in user can use the chat, so the CLI runs locked down: only the Read/Edit/Write/Glob/Grep
tools, confined to the chat folder (`--restricted`); no shell, web access, MCP servers/connectors
(`--strict-mcp-config`), user hooks or settings; anything needing a permission prompt is denied.

| Env var | Default | |
|---|---|---|
| `CHAT` | on | `CHAT=off` disables the chat endpoint |
| `CLAUDE_BIN` | `claude` | path to the Claude Code CLI |
| `CLAUDE_MODEL` | CLI default | e.g. `sonnet`, `opus` |
| `CHAT_TIMEOUT_MS` | 300000 | per-message timeout |

The provider lives in `packages/server/src/chat/claudeCode.ts` and implements the `ChatProvider` interface
(`run({ cwd, prompt, systemPrompt, sessionId })`, see `packages/server/src/chat/types.ts`), so other LLM
providers can be added next to it later.

## AI providers

The server decides which AI providers users may use; users cannot add providers or URLs of their own. (The chat
above still runs through the Claude Code CLI; the next release moves it onto these providers.) There are two modes:

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
tokens or provider URLs.

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

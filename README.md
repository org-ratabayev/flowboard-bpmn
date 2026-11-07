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

New dependencies must be published at least 14 days before they are installed (`minimumReleaseAge` in
`pnpm-workspace.yaml`).

## Storage

Everything is plain files in the folder set by `BPMN_DIR` (default `~/workspace/bpmn-diagrams/`):

```
bpmn-diagrams/
  order-flow/
    order-flow.bpmn                       <- latest version, open in Camunda Modeler / demo.bpmn.io / any BPMN tool
    project.json                          <- display name, creation date
    history/
      2026-11-05T12-35-39-675Z.bpmn       <- every saved version (UTC timestamp)
      log.jsonl                           <- who saved each version, and notes
```

If the server is down, open these files directly with any BPMN tool. Back them up by copying the folder.

## Features

- Project list with create and import of existing `.bpmn` files.
- Save with the button or Ctrl/Cmd+S. Each save is a new history entry.
- History panel lets you view any version, download it, or restore it (restoring adds a new version; nothing is ever overwritten).
- "Your name" field is recorded with each save.
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

**Safety:** anyone with the link can use the chat, so the CLI runs locked down: only the Read/Edit/Write/Glob/Grep
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

## Sharing outside your network

There is **no authentication**: anyone with the URL can see all projects and edit them.

Easiest option: a Cloudflare quick tunnel (no account needed):

```sh
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://<random>.trycloudflare.com` URL. Share `https://<random>.trycloudflare.com/p/<project-id>`.
The URL changes every time you restart the tunnel.

Alternatives: `ngrok http 3000`, or `tailscale funnel 3000` (stable URL), or router port-forwarding to your machine's IP.

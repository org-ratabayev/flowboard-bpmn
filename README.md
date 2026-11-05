# Local BPMN editor

bpmn.io (bpmn-js 18.31.0) with saved projects, full version history and shareable links.
No dependencies to install: the server uses only Node built-ins, and all browser code is vendored in `public/vendor/`.

## Run

```sh
npm start                      # or: node server.js
PORT=8080 npm start            # different port
BPMN_DIR=~/somewhere npm start # different storage folder
```

Open http://localhost:3000. The startup log also prints your network address(es) for sharing on the LAN.

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
- Concurrent editing: if someone saved after you loaded, you get a choice to load theirs or save yours on top. Both stay in history.
  Open editors pick up other people's saves automatically (every 10s) when they have no unsaved changes.
- **What changed**: in History, "what changed" highlights elements added (green), changed (orange) and moved (blue)
  compared to the previous version, and lists removed elements (bpmn-js-differ).
- **Properties panel** (right side, toggle with "Properties"): edit IDs, names, documentation, etc.
- **Color picker**: select elements → paint-bucket icon in the context pad.
- **Linting**: toggle the issues button bottom-left of the canvas; checks the bpmnlint "recommended" rules.
- **Token simulation**: toggle top-left of the canvas (or press `T`) to animate tokens through the process.
- **Minimap**: toggle top-right of the canvas.
- **More ▾** menu: download `.bpmn`, export SVG / PNG, auto-layout the diagram.
  Files without diagram layout (pure process XML) get a layout generated automatically when opened.

## Plugins and upgrading

| Plugin | Version | Location |
|---|---|---|
| bpmn-js | 18.31.0 | `public/vendor/bpmn-js/` (UMD bundle from unpkg) |
| bpmn-js-color-picker | 0.7.2 | `public/vendor/bpmn-js-color-picker/` (wrapped into a browser script) |
| bpmn-js-properties-panel (+ @bpmn-io/properties-panel 3.58.1) | 5.65.3 | `public/vendor/esm/raw/` (original files from unpkg, see script comment) |
| bpmn-js-differ | 3.2.0 | `public/vendor/esm/` |
| bpmn-js-bpmnlint / bpmnlint | 0.25.0 / 12.0.0 | `public/vendor/esm/`, rules packed in `public/js/lint-config.mjs` |
| bpmn-js-token-simulation | 1.1.0 | `public/vendor/esm/` |
| diagram-js-minimap | 5.6.0 | `public/vendor/esm/` |
| bpmn-auto-layout | 1.3.0 | `public/vendor/esm/` |

The ES-module plugins are fetched pre-bundled from esm.sh by `scripts/vendor-plugins.py`, so no npm install is
needed. To upgrade, bump the versions in that script and run `python3 scripts/vendor-plugins.py`.
If you change `LINT_RULES`, regenerate `public/js/lint-config.mjs` accordingly.

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

# Codex Dream Skin Agent Guide

## Scope

This repository themes the official Codex Desktop app without modifying the
application bundle, `app.asar`, or its code signature. Keep macOS runtime work
inside `macos/` and preserve Windows behavior unless the task explicitly spans
both platforms. The editable shared renderer and CSS live under `runtime/`;
files under `macos/assets/` and `windows/assets/` are generated. After changing
either runtime source, run `node tools/sync-runtime-assets.mjs` and verify both
generated platform copies.

## macOS Node Runtime

- Never use Homebrew Node, `nvm`, `/usr/local/bin/node`, or the Agent's own Node
  to run the installed injector.
- Discover the official bundle by identifier `com.openai.codex`, then use
  `Contents/Resources/cua_node/bin/node` from that exact bundle.
- Require Node.js 22 or newer plus global `WebSocket`, `fetch`, and
  `AbortSignal.timeout`. These are required by `inspector-pulse.mjs`.
- Validate the Node binary's strict code signature, OpenAI Team ID
  `2DC432GLL2`, and current Mac architecture before use.
- Surface the actual detected version or missing capability in errors. Do not
  collapse runtime failures into a generic "inject failed" message.
- Node Inspector may listen only on `127.0.0.1:9229`, only for a short pulse.
  Verify listener ownership and `process.pid`, then confirm the port closes.
- Never submit Codex, `start-dream-skin-macos.sh`, or a delayed apply through
  `launchctl submit`. macOS infers KeepAlive for submitted jobs, which relaunches
  Codex after a user quits and also captures the submitter's environment. Only
  the passive pulse watcher may use launchd, and it must never launch Codex.

## Multi-Image Themes

`theme.json` always requires `image`, which remains the compatibility fallback.
It may additionally define `homeImage`, `taskImage`, and `sidebarImage`. Missing
surface images fall back to `image`, so existing one-image themes stay valid.

- Home: prefer landscape 3:2 through 16:9, at least 1800 px wide, `fit: cover`.
- Task: portrait or square art can use `fit: contain`; landscape art normally
  uses `cover`. Keep the text side visually quiet.
- Sidebar: prefer portrait 2:3 through 3:4, at least 600 x 900, `fit: cover`.
- Use `art.home`, `art.task`, and `art.sidebar` with `focusX`/`focusY` in `0..1`
  and `fit: auto | cover | contain`. Set the focal point on the rider/product,
  not the geometric center when the subject is off-axis.
- Each prepared PNG/JPEG/WebP must be at most 16 MB, 16384 px per side, and
  50 megapixels. Stage every referenced file before publishing `theme.json`.
- Never use screenshots containing Codex UI as background artwork.

Example:

```json
{
  "schemaVersion": 1,
  "image": "home.jpg",
  "homeImage": "home.jpg",
  "taskImage": "task.webp",
  "sidebarImage": "sidebar.jpg",
  "art": {
    "home": { "focusX": 0.62, "focusY": 0.48, "fit": "cover" },
    "task": { "focusX": 0.5, "focusY": 0.42, "fit": "contain" },
    "sidebar": { "focusX": 0.5, "focusY": 0.5, "fit": "cover" }
  }
}
```

## Verification

Use the signed bundled Node for macOS checks:

```bash
cd macos
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --check scripts/inspector-pulse.mjs
npm test
```

Also run `node --test windows/tests/*.test.mjs`, `git diff --check`, and an app
package-layout check for release changes. Do not install a development branch on
the current machine unless the user explicitly asks for installation.

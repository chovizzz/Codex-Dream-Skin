# Runtime notes

- Discover the official `com.openai.codex` bundle on every launch; do not assume an upgrade keeps the same executable internals.
- Use `Contents/Resources/cua_node/bin/node` from that bundle. Require Node.js 20+, a valid strict code signature, matching architecture, and OpenAI Team ID `2DC432GLL2` on both app and runtime.
- State readers that can run before a validated launch must establish this runtime identity at their own execution boundary; never treat an inherited `NODE` value as proof of trust.
- Do not ship a Node binary and do not depend on a globally installed `node` or `npm`.
- Launch the official executable normally, without Chromium remote-debugging arguments.
- Signal only the verified Codex main PID to open Node Inspector on its standard loopback port `9229`.
- Refuse an unrelated listener, validate the loopback WebSocket URL, and confirm `process.pid` before evaluating the Electron main-process expression.
- Install guarded main-process hooks for renderer reloads and future windows, then close Inspector immediately. The PID watcher never holds a debugging port open.
- Poll page targets and reinject after document loads. A debounced mutation observer plus a low-frequency safety timer handles in-page route changes.
- Record injector PID, start time, executable, script path, app identity, selected port, and theme directory. Refuse to stop a PID when any required identity differs.
- Store mutable data under `~/Library/Application Support/CodexDreamSkinStudio`; keep the installed program under `~/.codex/codex-dream-skin-studio`.
- Back up and restore only `appearanceTheme` and `appearanceDarkCodeThemeId`. Leave `appearanceDarkChromeTheme` and unrelated TOML content untouched.
- Never modify, replace, unpack, repack, re-sign, or back up `app.asar`.

#!/bin/bash

# Soft-off: remove the live skin and stop the pulse watcher. This does not
# restore the user's original Codex appearance setting.

set -Eeuo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

OPERATION_TOKEN="$(new_operation_token)"

record_pause_error() {
  local code="$1"
  [ "$code" -ne 0 ] || return 0
  write_operation_state failed "暂停失败，原状态可能未改变" "$OPERATION_TOKEN" 2>/dev/null || true
  alert_user "暂停失败，请重新打开菜单查看状态。"
}
trap 'record_pause_error "$?"' EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) shift 2 ;;
    *) fail "Unknown pause argument: $1" ;;
  esac
done
PORT="$INSPECTOR_PORT"

ensure_state_root
write_operation_state pausing "正在暂停皮肤" "$OPERATION_TOKEN" \
  || fail "Could not publish the pause operation state."
discover_codex_app
require_signed_node_runtime
if codex_is_running; then verify_macos_app_signature quick; else verify_macos_app_signature deep; fi

if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector \
    || fail "Could not stop the recorded pulse watcher; pause state was not written."
fi

REMOVED="false"
if codex_is_running; then
  CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
  [ -n "$CODEX_PID" ] || fail "Could not identify the verified ChatGPT main process."
  "$NODE" "$PULSE" --remove --pid "$CODEX_PID" --codex-exe "$CODEX_EXE" \
    --port "$PORT" --timeout-ms 12000 >/dev/null \
    || fail "Could not remove the live skin from ChatGPT."
  REMOVED="true"
fi

"$NODE" -e '
  const fs = require("node:fs");
  const [file, port, themeDir, root, pulse] = process.argv.slice(1);
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const state = {
    ...prev,
    schemaVersion: 4,
    injectorProtocol: 4,
    session: "paused",
    port: Number(port),
    injectorPid: 0,
    injectorStartedAt: "",
    injectorPath: pulse,
    injectorMode: "stopped",
    themeDir,
    projectRoot: root,
    pausedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  delete state.appliedThemeId;
  delete state.appliedThemeName;
  delete state.verifiedAt;
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
' "$STATE_PATH" "$PORT" "$THEME_DIR" "$PROJECT_ROOT" "$PULSE"

write_operation_state paused "皮肤已暂停" "$OPERATION_TOKEN" \
  || fail "Could not publish the completed pause state."
trap - EXIT

if [ "$REMOVED" = "true" ]; then
  printf 'ChatGPT Dream Skin paused; Node Inspector closed after the removal pulse.\n'
else
  printf 'ChatGPT Dream Skin paused (ChatGPT is not running).\n'
fi

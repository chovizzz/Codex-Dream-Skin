#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

REQUIRE_LIVE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --require-live) REQUIRE_LIVE="true"; shift ;;
    *) fail "Unknown doctor argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
[ -f "$CONFIG_PATH" ] || fail "Codex config not found: $CONFIG_PATH"
for required in \
  "$PROJECT_ROOT/assets/dream-skin.css" \
  "$PROJECT_ROOT/assets/renderer-inject.js" \
  "$PROJECT_ROOT/assets/selectors.json" \
  "$PROJECT_ROOT/assets/theme.json" \
  "$PROJECT_ROOT/scripts/injector.mjs" \
  "$PROJECT_ROOT/scripts/inspector-pulse.mjs"; do
  [ -s "$required" ] || fail "Required project file is missing or empty: $required"
done

PAYLOAD_JSON="$("$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR")"
PORT="$INSPECTOR_PORT"
LIVE="false"
STATE_VERSION=""
STATE_PROTOCOL=""
STATE_SESSION=""
if [ -f "$STATE_PATH" ]; then
  STATE_VERSION="$(state_field skinVersion 2>/dev/null || true)"
  STATE_PROTOCOL="$(state_field injectorProtocol 2>/dev/null || true)"
  STATE_SESSION="$(state_field session 2>/dev/null || true)"
fi
if [ "$STATE_VERSION" = "$SKIN_VERSION" ] && [ "$STATE_PROTOCOL" = "4" ] \
  && [ "$STATE_SESSION" = "active" ] && codex_is_running; then
  CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
  if [ -n "$CODEX_PID" ] && "$NODE" "$PULSE" --verify --pid "$CODEX_PID" \
    --codex-exe "$CODEX_EXE" --port "$PORT" --theme-dir "$THEME_DIR" \
    --timeout-ms 12000 >/dev/null; then
    LIVE="true"
  fi
fi
[ "$REQUIRE_LIVE" = "false" ] || [ "$LIVE" = "true" ] || fail "No verified live Dream Skin session is active."

"$NODE" -e '
  const payload = JSON.parse(process.argv[1]);
  const result = {
    pass: true,
    product: "Codex Dream Skin Studio",
    version: process.argv[2],
    platform: `darwin-${process.argv[3]}`,
    codexVersion: process.argv[4],
    codexTeamId: process.argv[5],
    nodeVersion: process.argv[6],
    officialAppSignatureValid: true,
    modifiesAppAsar: false,
    inspectorPersistent: false,
    live: process.argv[7] === "true",
    port: Number(process.argv[8]),
    theme: {
      id: payload.themeId,
      name: payload.themeName,
      imageBytes: payload.imageBytes,
      payloadBytes: payload.payloadBytes,
    },
  };
  console.log(JSON.stringify(result, null, 2));
' "$PAYLOAD_JSON" "$SKIN_VERSION" "$(/usr/bin/uname -m)" "$CODEX_VERSION" "$CODEX_TEAM_ID" "$NODE_VERSION" "$LIVE" "$PORT"

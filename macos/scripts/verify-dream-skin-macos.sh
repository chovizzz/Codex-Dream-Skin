#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT="$INSPECTOR_PORT"
SCREENSHOT=""
RELOAD="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) shift 2 ;;
    --screenshot) SCREENSHOT="${2:-}"; shift 2 ;;
    --reload) RELOAD="true"; shift ;;
    *) fail "Unknown verify argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
[ -n "$CODEX_PID" ] || fail "ChatGPT is not running."

ARGS=("$PULSE" --verify --pid "$CODEX_PID" --codex-exe "$CODEX_EXE" \
  --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 30000)
[ -n "$SCREENSHOT" ] && ARGS+=(--screenshot "$SCREENSHOT")
[ "$RELOAD" = "true" ] && ARGS+=(--reload)
exec "$NODE" "${ARGS[@]}"

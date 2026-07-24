#!/bin/bash

set -Eeuo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

OPERATION_TOKEN=""
OPERATION_FINISHED="false"
VERIFY_OUTPUT=""

record_start_exit() {
  local code="$1"
  local line="$2"
  local current_session=""
  [ -z "${VERIFY_OUTPUT:-}" ] || /bin/rm -f "$VERIFY_OUTPUT"
  [ "$code" -ne 0 ] || return 0
  [ "$OPERATION_FINISHED" != "true" ] || return 0
  [ -n "${OPERATION_TOKEN:-}" ] || return 0
  ensure_state_root 2>/dev/null || true
  if [ -f "$STATE_PATH" ] && [ -n "${NODE:-}" ]; then
    current_session="$(state_field session 2>/dev/null || true)"
    [ "$current_session" != "applying" ] || mark_state_stale 2>/dev/null || true
  fi
  printf '%s exit=%s line=%s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$code" "$line" \
    >> "$START_ERROR_LOG" 2>/dev/null || true
  write_operation_state failed "应用失败，应用结果未确认" "${OPERATION_TOKEN:-}" 2>/dev/null || true
  printf 'ChatGPT Dream Skin: start failed at line %s (exit %s). See %s\n' \
    "$line" "$code" "$START_ERROR_LOG" >&2
}
trap 'code=$?; record_start_exit "$code" "$LINENO"' EXIT

# Legacy flags remain accepted so launchers made by older releases keep
# working. Node Inspector itself always uses its standard loopback port 9229.
FOREGROUND_INJECTOR="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) shift 2 ;;
    --restart-existing|--prompt-restart) shift ;;
    --foreground-injector) FOREGROUND_INJECTOR="true"; shift ;;
    *) fail "Unknown start argument: $1" ;;
  esac
done
PORT="$INSPECTOR_PORT"

ensure_state_root
if [ "$FOREGROUND_INJECTOR" != "true" ]; then
  OPERATION_TOKEN="$(new_operation_token)"
  write_operation_state applying "正在应用皮肤" "$OPERATION_TOKEN" \
    || fail "Could not publish the apply operation state."
fi

discover_codex_app
require_signed_node_runtime
"$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null

if codex_is_running; then
  verify_macos_app_signature quick
else
  verify_macos_app_signature deep
  sync_appearance_pin >/dev/null \
    || printf 'Warning: could not sync Codex appearanceTheme to the active theme; native menus may keep the previous appearance.\n' >&2
  printf 'Opening ChatGPT normally before the Inspector pulse…\n' >&2
  launch_codex_normally
  wait_for_codex_main \
    || fail "ChatGPT did not start within 45 seconds. See $APP_LOG and $APP_ERROR_LOG"
fi

CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
[ -n "$CODEX_PID" ] || fail "Could not identify the verified ChatGPT main process."

if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector \
    || fail "Could not stop the recorded injector; state was preserved."
fi

VERIFY_OUTPUT="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/dream-skin-pulse.XXXXXX")"
/bin/chmod 600 "$VERIFY_OUTPUT"
if ! "$NODE" "$PULSE" --apply --pid "$CODEX_PID" --port "$PORT" \
  --codex-exe "$CODEX_EXE" --theme-dir "$THEME_DIR" \
  --timeout-ms 30000 >"$VERIFY_OUTPUT" 2>>"$INJECTOR_ERROR_LOG"; then
  /bin/rm -f "$VERIFY_OUTPUT"
  VERIFY_OUTPUT=""
  fail "Node Inspector pulse injection or renderer verification failed. See $INJECTOR_ERROR_LOG"
fi
/bin/rm -f "$VERIFY_OUTPUT"
VERIFY_OUTPUT=""

if [ "$FOREGROUND_INJECTOR" = "true" ]; then
  exec "$NODE" "$PULSE" --watch --port "$PORT" --theme-dir "$THEME_DIR" \
    --codex-exe "$CODEX_EXE" --initial-pid "$CODEX_PID"
fi

INJECTOR_PID="$(launch_injector_daemon "$PORT" "$CODEX_PID")"
/bin/kill -0 "$INJECTOR_PID" 2>/dev/null \
  || fail "The pulse watcher exited during startup. See $INJECTOR_ERROR_LOG"
INJECTOR_STARTED_AT="$(process_started_at "$INJECTOR_PID")"
[ -n "$INJECTOR_STARTED_AT" ] || fail "Could not record the pulse watcher process start time."
write_state "$PORT" "$INJECTOR_PID" "$INJECTOR_STARTED_AT" "$CODEX_PID"
mark_state_active || fail "Could not commit the verified active skin state."
write_operation_state success "皮肤已应用" "$OPERATION_TOKEN" \
  || fail "Could not publish the completed apply state."
OPERATION_FINISHED="true"
printf 'ChatGPT Dream Skin %s is active; Node Inspector closed after the pulse.\n' "$SKIN_VERSION"

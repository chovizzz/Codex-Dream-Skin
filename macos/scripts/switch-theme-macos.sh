#!/bin/bash

# Switch to a theme pack under themes/<id> and apply with an Inspector pulse.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

THEME_ID=""
APPLY_NOW="true"
OPERATION_TOKEN=""
stage=""

finish_switch() {
  local code="$1"
  [ -z "${stage:-}" ] || /bin/rm -rf "$stage"
  if [ "$code" -ne 0 ] && [ -n "${OPERATION_TOKEN:-}" ]; then
    write_operation_state failed "主题切换未完成，应用结果未确认" "$OPERATION_TOKEN" 2>/dev/null || true
    finish_client_operation "${PORT:-9229}" error "主题切换未完成，应用结果未确认" \
      "$OPERATION_TOKEN" 1500 >/dev/null 2>&1 || true
  fi
}
trap 'finish_switch "$?"' EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$THEME_ID" ] || fail "Usage: switch-theme-macos.sh --id <theme-id>"
case "$THEME_ID" in
  *[!A-Za-z0-9_-]*|'') fail "Theme id may contain only letters, numbers, underscores, and hyphens." ;;
esac
[ "${#THEME_ID}" -le 80 ] || fail "Theme id is too long."

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
SRC="$THEMES_ROOT/$THEME_ID"
[ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
[ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"
if [ "$APPLY_NOW" = "true" ]; then
  OPERATION_TOKEN="$(new_operation_token)"
  write_operation_state applying "正在切换主题" "$OPERATION_TOKEN" \
    || fail "Could not publish the theme switch operation state."
fi
ensure_node_runtime
themes_root_real="$(cd "$THEMES_ROOT" && pwd -P)"
src_real="$(cd "$SRC" && pwd -P)"
case "$src_real/" in "$themes_root_real/"*) ;; *) fail "Theme directory escapes the saved theme library." ;; esac

PORT="$INSPECTOR_PORT"

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

progress "Switching..."

stage="$(/usr/bin/mktemp -d "$STATE_ROOT/.theme-switch.XXXXXX")"
/bin/mkdir -p "$THEME_DIR"
/bin/chmod 700 "$stage"
# Snapshot theme.json and its referenced image from stable, no-follow file
# descriptors. This closes the validation/copy TOCTOU window: after this
# command returns, edits or symlink swaps in themes/<id> cannot mix the pair
# that will be published to the live theme directory.
THEME_IMAGES="$("$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$SRC" "$stage")" \
  || fail "Theme pack changed or failed staging: $THEME_ID"
# Validate the exact staged pair, not the mutable library directory. The
# injector performs the full schema, path, dimensions, and image checks.
"$NODE" "$INJECTOR" --check-payload --theme-dir "$stage" >/dev/null \
  || fail "Theme pack failed validation: $THEME_ID"
THEME_BYTES=0
while IFS= read -r theme_image; do
  [ -n "$theme_image" ] || continue
  image_bytes="$(/usr/bin/stat -f '%z' "$stage/$theme_image")"
  [ "$image_bytes" -gt 0 ] && [ "$image_bytes" -le 16777216 ] \
    || fail "Each theme image must be non-empty and no larger than 16 MB."
  THEME_BYTES=$((THEME_BYTES + image_bytes))
done <<< "$THEME_IMAGES"
[ "$THEME_BYTES" -gt 0 ] || fail "Theme pack did not stage any images."
/bin/chmod 600 "$stage/"*
for entry in "$stage/"*; do
  [ -f "$entry" ] || continue
  [ "$(/usr/bin/basename "$entry")" = "theme.json" ] && continue
  /bin/mv -f "$entry" "$THEME_DIR/"
done
# theme.json is the commit marker: the watcher never observes a config that
# references a partially copied image.
/bin/mv -f "$stage/theme.json" "$THEME_DIR/theme.json"
theme_image_set=$'\n'"$THEME_IMAGES"$'\n'
for entry in "$THEME_DIR"/*; do
  [ -f "$entry" ] || continue
  entry_name="$(/usr/bin/basename "$entry")"
  [ "$entry_name" = "theme.json" ] && continue
  case "$theme_image_set" in
    *$'\n'"$entry_name"$'\n'*) ;;
    *) /bin/rm -f "$entry" ;;
  esac
done
/bin/rm -rf "$stage"
stage=""

THEME_NAME="$("$NODE" -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(t.name||"")}catch{}' "$THEME_DIR/theme.json" 2>/dev/null || true)"
[ -n "$THEME_NAME" ] || THEME_NAME="$THEME_ID"

if [ "$APPLY_NOW" != "true" ]; then
  progress "Ready: ${THEME_NAME} (not applied)"
  exit 0
fi

# Hot path: a short Inspector pulse updates the running app.
if hot_reapply_theme "$PORT" 8000 "$OPERATION_TOKEN"; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

# Cold path opens Codex normally, then pulses once.
progress "Opening ChatGPT and applying..."
if "$SCRIPT_DIR/start-dream-skin-macos.sh"; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

alert_user "Theme saved, but apply failed. ${HOT_REAPPLY_ERROR:-Open Diagnostics for the exact runtime error.}"
exit 1

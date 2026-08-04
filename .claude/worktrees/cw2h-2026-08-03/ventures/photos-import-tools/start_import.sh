#!/usr/bin/env bash
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="${STATE_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/media-assets/Photos_Organized/.import_state}"
ROOT_DIR="${ROOT_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/media-assets/Photos_Organized/2026}"
BATCH_SIZE="${BATCH_SIZE:-10}"
INCLUDE_RAWS="${INCLUDE_RAWS:-1}"
RAW_BATCH_SIZE="${RAW_BATCH_SIZE:-3}"
RAW_TIMEOUT="${RAW_TIMEOUT:-600}"

rm -f "$STATE_DIR/STOP"

WATCHDOG_ARGS=(
  --root "$ROOT_DIR"
  --state-dir "$STATE_DIR"
  --tool-dir "$TOOL_DIR"
  --batch-size "$BATCH_SIZE"
)

if [[ "$INCLUDE_RAWS" == "1" ]]; then
  WATCHDOG_ARGS+=(--include-raws --raw-batch-size "$RAW_BATCH_SIZE" --raw-timeout "$RAW_TIMEOUT")
fi

exec caffeinate -dims "$TOOL_DIR/.venv/bin/python" "$TOOL_DIR/photos_import_watchdog.py" \
  "${WATCHDOG_ARGS[@]}" \
  >> "$STATE_DIR/watchdog.log" 2>&1

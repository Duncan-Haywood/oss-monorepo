#!/usr/bin/env bash
set -euo pipefail

confirmation="${1:-}"
issue="${2:-}"
evidence="${3:-}"
expires="${4:-}"

[[ "$confirmation" == "APPROVED" ]] || {
  echo "Release exception was not explicitly approved." >&2
  exit 1
}
[[ "$issue" =~ ^https://git\.marisstella\.dev/.+/issues/[0-9]+$ ]] || {
  echo "Release exception must reference a Gitea issue URL." >&2
  exit 1
}
[[ "$evidence" =~ ^https:// ]] || {
  echo "Release exception must link to review, test, and rollback evidence." >&2
  exit 1
}
[[ "$expires" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || {
  echo "Release exception expiry must use YYYY-MM-DD." >&2
  exit 1
}

if expiry_epoch="$(date -u -j -f '%Y-%m-%d %H:%M:%S' "${expires} 00:00:00" +%s 2>/dev/null)"; then
  : # BSD date (local macOS)
elif expiry_epoch="$(date -u -d "${expires} 00:00:00" +%s 2>/dev/null)"; then
  : # GNU date (CI)
else
  echo "Release exception expiry is not a valid date." >&2
  exit 1
fi

today="$(date -u +%Y-%m-%d)"
if today_epoch="$(date -u -j -f '%Y-%m-%d %H:%M:%S' "${today} 00:00:00" +%s 2>/dev/null)"; then
  :
else
  today_epoch="$(date -u -d "${today} 00:00:00" +%s)"
fi
max_epoch=$((today_epoch + 30 * 24 * 60 * 60))
(( expiry_epoch >= today_epoch && expiry_epoch <= max_epoch )) || {
  echo "Release exception must expire today or within 30 days." >&2
  exit 1
}

#!/usr/bin/env bash
set -Eeuo pipefail

revision="${1:?usage: wait-for-pairwise-release.sh REVISION [HOST]}"
host="${2:-pairwise.marisstella.dev}"
attempts="${PAIRWISE_RELEASE_WAIT_ATTEMPTS:-40}"
interval="${PAIRWISE_RELEASE_WAIT_INTERVAL_SECONDS:-15}"

[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'Invalid Git revision: %s\n' "$revision" >&2
  exit 2
}

for ((attempt = 1; attempt <= attempts; attempt++)); do
  body="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
    "https://${host}/api/health" 2>/dev/null || true)"
  if jq -e --arg revision "$revision" \
    '.status == "ok" and .revision == $revision' <<<"$body" >/dev/null 2>&1; then
    printf 'Pairwise revision %s is serving after %d check(s)\n' "$revision" "$attempt"
    exit 0
  fi
  printf 'Waiting for Pairwise revision %s (%d/%d)\n' "$revision" "$attempt" "$attempts"
  sleep "$interval"
done

printf 'Pairwise revision %s did not become visible at https://%s/api/health\n' \
  "$revision" "$host" >&2
exit 1

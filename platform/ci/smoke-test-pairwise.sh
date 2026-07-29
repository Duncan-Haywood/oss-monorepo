#!/usr/bin/env bash
set -Eeuo pipefail

host="${1:-pairwise.marisstella.dev}"
base_url="https://${host}"

request() {
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --retry 5 \
    --retry-all-errors \
    --connect-timeout 10 \
    --max-time 30 \
    "$@"
}

expect_content() {
  local path="$1"
  local expected="$2"
  local body

  body="$(request "${base_url}${path}")"
  grep -Fq "$expected" <<<"$body" || {
    printf 'Expected %s to contain %q\n' "$path" "$expected" >&2
    exit 1
  }
}

expect_content "/api/health" '"status":"ok"'
expect_content "/api/health/ready" '"status":"ready"'
expect_content "/" "How It Works"
expect_content "/app" "Pairwise"
expect_content "/couple" "Pairwise"
expect_content "/privacy" "Privacy"
expect_content "/terms" "Terms"

# This is a read-only database-backed route. Readiness alone proves only one
# query; this also proves the application can serialize real seeded content.
request "${base_url}/api/surveys/combined" >/dev/null

headers="$(request --head "${base_url}/")"
grep -Eiq '^x-content-type-options:[[:space:]]*nosniff' <<<"$headers" || {
  printf 'Missing X-Content-Type-Options on %s\n' "$base_url" >&2
  exit 1
}
grep -Eiq '^x-frame-options:' <<<"$headers" || {
  printf 'Missing X-Frame-Options on %s\n' "$base_url" >&2
  exit 1
}

printf 'Pairwise production smoke tests passed for %s\n' "$base_url"

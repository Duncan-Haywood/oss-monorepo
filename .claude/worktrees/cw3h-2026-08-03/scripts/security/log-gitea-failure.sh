#!/usr/bin/env bash
set -euo pipefail

# Dual-provider Security Scan Failure Logger (Gitea & GitHub Actions)

TOKEN="${GITEA_API_TOKEN:-${GITHUB_TOKEN:-}}"
SERVER_URL="${GITEA_SERVER_URL:-${GITHUB_SERVER_URL:-https://github.com}}"
REPOSITORY="${GITEA_REPOSITORY:-${GITHUB_REPOSITORY:-}}"
RUN_ID="${GITEA_RUN_ID:-${GITHUB_RUN_ID:-unknown}}"
COMMIT_SHA="${GITEA_SHA:-${GITHUB_SHA:-unknown}}"

if [[ -z "$TOKEN" || -z "$REPOSITORY" ]]; then
  echo "ℹ Security issue logging skipped: missing API token or repository name."
  exit 0
fi

case "$REPOSITORY" in
  */*) ;;
  *) printf 'REPOSITORY must be owner/name\n' >&2; exit 2 ;;
esac

api_root="${SERVER_URL%/}/api/v1"
if [[ "$SERVER_URL" == *"github.com"* ]]; then
  api_root="https://api.github.com"
fi

repo_path="repos/${REPOSITORY}"
marker="<!-- automated-security-scan -->"
run_url="${SERVER_URL%/}/${REPOSITORY}/actions/runs/${RUN_ID}"
title="Security scanning requires attention"
body="$marker
A default-branch or scheduled security scan failed.

Run: $run_url
Commit: \`${COMMIT_SHA}\`

Triage against \`SECURITY_ROADMAP.md\` and \`SECURITY.md\`. Download the redacted scan artifacts from the run. Do not paste secrets into this issue."

auth_header="Authorization: token $TOKEN"
if [[ "$SERVER_URL" == *"github.com"* ]]; then
  auth_header="Authorization: Bearer $TOKEN"
fi

issues_json="$(curl --fail --silent --show-error \
  --header "$auth_header" \
  "$api_root/$repo_path/issues?state=open&limit=50" || echo "[]")"

issue_number="$(jq -r --arg marker "$marker" \
  '.[]? | select((.body // "") | contains($marker)) | .number' \
  <<<"$issues_json" | head -n 1)"

payload="$(jq -n --arg title "$title" --arg body "$body" \
  '{title: $title, body: $body}')"

if [[ -n "$issue_number" && "$issue_number" != "null" ]]; then
  curl --fail --silent --show-error \
    --request PATCH \
    --header "$auth_header" \
    --header "Content-Type: application/json" \
    --data "$payload" \
    "$api_root/$repo_path/issues/$issue_number" >/dev/null || true
  printf 'Updated security issue #%s\n' "$issue_number"
else
  curl --fail --silent --show-error \
    --request POST \
    --header "$auth_header" \
    --header "Content-Type: application/json" \
    --data "$payload" \
    "$api_root/$repo_path/issues" >/dev/null || true
  printf 'Created security issue\n'
fi

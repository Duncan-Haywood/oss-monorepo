#!/usr/bin/env bash
set -euo pipefail

: "${GITEA_API_TOKEN:?GITEA_API_TOKEN is required}"
: "${GITEA_SERVER_URL:?GITEA_SERVER_URL is required}"
: "${GITEA_REPOSITORY:?GITEA_REPOSITORY is required}"

case "$GITEA_REPOSITORY" in
  */*) ;;
  *) printf 'GITEA_REPOSITORY must be owner/name\n' >&2; exit 2 ;;
esac

api_root="${GITEA_SERVER_URL%/}/api/v1"
repo_path="repos/${GITEA_REPOSITORY}"
marker="<!-- automated-security-scan -->"
run_url="${GITEA_SERVER_URL%/}/${GITEA_REPOSITORY}/actions/runs/${GITEA_RUN_ID:-unknown}"
title="Security scanning requires attention"
body="$marker
A default-branch or scheduled security scan failed.

Run: $run_url
Commit: \`${GITEA_SHA:-unknown}\`

Triage against \`docs/security/REMEDIATION_LOG.md\`. Download the redacted scan artifacts from the run. Do not paste secrets into this issue."

auth_header="Authorization: token $GITEA_API_TOKEN"
issues_json="$(curl --fail --silent --show-error \
  --header "$auth_header" \
  "$api_root/$repo_path/issues?state=open&type=issues&limit=50")"
issue_number="$(jq -r --arg marker "$marker" \
  '.[] | select((.body // "") | contains($marker)) | .number' \
  <<<"$issues_json" | head -n 1)"
payload="$(jq -n --arg title "$title" --arg body "$body" \
  '{title: $title, body: $body}')"

if [[ -n "$issue_number" ]]; then
  curl --fail --silent --show-error \
    --request PATCH \
    --header "$auth_header" \
    --header "Content-Type: application/json" \
    --data "$payload" \
    "$api_root/$repo_path/issues/$issue_number" >/dev/null
  printf 'Updated Gitea security issue #%s\n' "$issue_number"
else
  curl --fail --silent --show-error \
    --request POST \
    --header "$auth_header" \
    --header "Content-Type: application/json" \
    --data "$payload" \
    "$api_root/$repo_path/issues" >/dev/null
  printf 'Created Gitea security issue\n'
fi

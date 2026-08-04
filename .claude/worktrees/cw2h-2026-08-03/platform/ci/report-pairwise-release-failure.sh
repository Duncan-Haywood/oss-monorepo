#!/usr/bin/env bash
set -Eeuo pipefail

token="${GITEA_API_TOKEN:-}"
server="${GITEA_SERVER_URL:-https://git.marisstella.dev}"
repository="${GITEA_REPOSITORY:-}"
revision="${PAIRWISE_RELEASE_REVISION:-${GITEA_SHA:-unknown}}"
run_id="${GITEA_RUN_ID:-unknown}"
gate="${PAIRWISE_FAILED_GATE:-production smoke}"

if [[ -z "$token" || -z "$repository" ]]; then
  printf 'Pairwise repair handoff skipped: Gitea token or repository is unavailable\n'
  exit 0
fi
[[ "$repository" == */* ]] || { printf 'Invalid repository: %s\n' "$repository" >&2; exit 2; }

api="${server%/}/api/v1/repos/${repository}"
auth="Authorization: token $token"
marker="<!-- pairwise-release-repair:${revision} -->"
run_url="${server%/}/${repository}/actions/runs/${run_id}"
short_revision="${revision:0:12}"
title="Pairwise production repair needed for ${short_revision}"
body="$marker
The GitOps release reached the production verification stage but **${gate}** failed.

- Release: \`${revision}\`
- Run: ${run_url}
- Repair budget: at most 3 distinct fixes; then require human review

Follow \`platform/ci/PAIRWISE-AI-REPAIR.md\`. Diagnose the first failing gate, make the smallest Pairwise-scoped fix on a branch, and open a pull request. Do not weaken a gate, reverse a migration, modify production directly, or merge the repair automatically. A merged fix must pass the complete pipeline and exact-revision production smoke test again."

issues="$(curl --fail --silent --show-error --header "$auth" \
  "$api/issues?state=open&limit=50")"
issue="$(jq -r --arg marker "$marker" \
  '.[] | select((.body // "") | contains($marker)) | .number' <<<"$issues" | head -n 1)"
payload="$(jq -n --arg title "$title" --arg body "$body" '{title:$title,body:$body}')"

if [[ -n "$issue" ]]; then
  curl --fail --silent --show-error --request PATCH --header "$auth" \
    --header 'Content-Type: application/json' --data "$payload" \
    "$api/issues/$issue" >/dev/null
else
  issue="$(curl --fail --silent --show-error --request POST --header "$auth" \
    --header 'Content-Type: application/json' --data "$payload" "$api/issues" |
    jq -r '.number')"
fi

labels="$(curl --fail --silent --show-error --header "$auth" "$api/labels?limit=100")"
label_ids=()
for name in agent pairwise production-smoke; do
  id="$(jq -r --arg name "$name" '.[] | select(.name == $name) | .id' <<<"$labels" | head -n 1)"
  if [[ -n "$id" ]]; then label_ids+=("$id"); fi
done
if ((${#label_ids[@]})); then
  labels_payload="$(printf '%s\n' "${label_ids[@]}" | jq -s '{labels: map(tonumber)}')"
  curl --fail --silent --show-error --request POST --header "$auth" \
    --header 'Content-Type: application/json' --data "$labels_payload" \
    "$api/issues/$issue/labels" >/dev/null
fi

printf 'Created or updated Pairwise repair issue #%s\n' "$issue"

#!/usr/bin/env bash
# Register one ephemeral self-hosted Actions runner, run a single job, exit.
#
# Ephemeral is the whole safety model. A runner that stays up between jobs
# carries whatever the last job left in /home/runner -- a checked-out branch, a
# node_modules, an env var -- into the next one. `--ephemeral` makes GitHub
# hand this runner exactly one job and then deregister it; the Deployment
# restarts the pod, and the next job starts on an empty filesystem. That is
# also why this is a Deployment and not a StatefulSet: nothing here is worth
# keeping.
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be owner/repo}"
: "${RUNNER_TOKEN:?RUNNER_TOKEN (a PAT with repo scope) must be set}"

RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,hetzner}"

# GitHub has two distinct endpoints for self-hosted runner tokens, and they are
# not interchangeable: a registration-token is only accepted by `config.sh`,
# and a remove-token is only accepted by `config.sh remove`. Each expires in an
# hour, so both are fetched fresh from the API rather than sealed; the
# long-lived PAT never leaves the pod.
#
# grep/sed rather than jq: the official runner image does not ship jq, and
# adding a package install to every pod start is a slower, more fragile way to
# read one string.
fetch_token() {
  local kind="$1"
  local response token
  response="$(curl -fsSL -X POST \
    -H "Authorization: Bearer ${RUNNER_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runners/${kind}-token")"
  token="$(printf '%s' "${response}" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')"
  printf '%s' "${token}"
}

echo "Requesting a registration token for ${GITHUB_REPOSITORY}..."
reg_token="$(fetch_token registration)"
if [ -z "${reg_token}" ]; then
  # Deliberately does not echo the API response: on some failures GitHub
  # returns the request back, and this log is the one place a token could leak.
  echo "Could not read a registration token from the API response." >&2
  echo "Check that RUNNER_TOKEN is a PAT with 'repo' scope on ${GITHUB_REPOSITORY}." >&2
  exit 1
fi

cd /home/runner

./config.sh \
  --url "https://github.com/${GITHUB_REPOSITORY}" \
  --token "${reg_token}" \
  --name "${RUNNER_NAME:-hetzner-$(hostname)}" \
  --labels "${RUNNER_LABELS}" \
  --work /home/runner/_work \
  --ephemeral \
  --unattended \
  --replace

# An ephemeral runner deregisters itself after its one job. The trap covers the
# other exit: the pod is evicted or rescheduled before a job ever arrives, which
# would otherwise leave a registered runner GitHub keeps trying to dispatch to.
# This needs its own token: the registration-token above is not valid for
# removal, and a stale reg_token silently no-ops here, leaving the orphaned
# runner listed (offline) in the repo's runner settings until someone prunes it
# by hand.
cleanup() {
  local remove_token
  remove_token="$(fetch_token remove 2>/dev/null || true)"
  [ -n "${remove_token}" ] && ./config.sh remove --token "${remove_token}" >/dev/null 2>&1
  true
}
trap cleanup EXIT INT TERM

exec ./run.sh

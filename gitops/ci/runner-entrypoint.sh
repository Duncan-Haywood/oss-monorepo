#!/usr/bin/env bash
# Register one ephemeral self-hosted Actions runner, run a single job, exit.
#
# Ephemeral is the whole safety model. A runner that stays up between jobs
# carries whatever the last job left in /home/runner -- a checked-out branch, a
# node_modules, an env var -- into the next one. `--ephemeral` makes GitHub
# hand this runner exactly one job and then deregister it; the container exits
# and the kubelet starts it again, rebuilt from the image. That is also why
# this is a Deployment and not a StatefulSet: nothing here is worth keeping.
#
# The one thing that restart does not rebuild is the `_work` emptyDir, which
# outlives it. The clean-up block below is what makes the "starts on an empty
# filesystem" half of this paragraph true on the second and every later job,
# rather than only on the first job a brand-new pod runs.
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be owner/repo}"
: "${RUNNER_TOKEN:?RUNNER_TOKEN (a PAT that can mint a runner registration token -- see gitops/ci/README.md) must be set}"

RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,hetzner}"

# Where the runner unpacks each job. In the pod this resolves to
# /home/runner/_work, the emptyDir gitops/ci/runner.yaml mounts there;
# RUNNER_DIR is overridden only so this script can be exercised outside the
# runner image.
RUNNER_WORK="${RUNNER_WORK:-${RUNNER_DIR:-/home/runner}/_work}"

# Empty it before registering. This is the ephemerality this stack claims, not
# a belt-and-braces extra.
#
# `--ephemeral` makes GitHub hand this runner exactly one job; run.sh then
# exits and so does this script. What happens next is NOT a fresh pod. A
# Deployment's pods may only set `restartPolicy: Always`, so the kubelet
# restarts the container inside the *same* pod -- the Deployment sees nothing
# to replace, because the pod never stopped Running. The container filesystem
# is rebuilt from the image on that restart, but an emptyDir is only cleared
# when the pod itself is removed from the node; a container restart leaves it
# untouched (that is the documented guarantee it exists to give).
#
# So job N+1 was starting on job N's `_work`: its checkout, its `_temp`, and
# its `_tool` cache. That is exactly the "carries whatever the last job left
# into the next one" this file's header says --ephemeral prevents, and it is
# the usual way self-hosted CI starts producing results that do not reproduce.
# Only the first job after a genuinely new pod ever saw a clean tree.
#
# Fails closed: a runner that cannot prove it is starting clean must not take
# a job.
if [ -d "${RUNNER_WORK}" ]; then
  find "${RUNNER_WORK}" -mindepth 1 -maxdepth 1 -exec rm -rf {} + || {
    echo "Could not clear ${RUNNER_WORK}." >&2
    echo "Refusing to register: a job here would inherit the previous one's tree." >&2
    exit 1
  }
else
  mkdir -p "${RUNNER_WORK}"
fi

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
  # Not just 'repo' scope: the documented, scripted path
  # (bootstrap/scripts/seal-owner-secrets.sh, gitops/ci/README.md) mints a
  # fine-grained PAT with the "Administration: Read and write" repository
  # permission, which is the narrowest thing that can mint a runner
  # registration token and carries no classic OAuth "scope" at all. A
  # classic PAT with full 'repo' scope also works but is broader than
  # necessary. Either way, check the token has not expired or been revoked,
  # and that it is scoped to exactly ${GITHUB_REPOSITORY}.
  echo "Check RUNNER_TOKEN can mint a runner registration token on ${GITHUB_REPOSITORY} -- see gitops/ci/README.md." >&2
  exit 1
fi

# Overridable only so the entrypoint can be exercised outside the runner image;
# the Deployment never sets it.
cd "${RUNNER_DIR:-/home/runner}"

./config.sh \
  --url "https://github.com/${GITHUB_REPOSITORY}" \
  --token "${reg_token}" \
  --name "${RUNNER_NAME:-hetzner-$(hostname)}" \
  --labels "${RUNNER_LABELS}" \
  --work "${RUNNER_WORK}" \
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
# shellcheck disable=SC2329  # invoked indirectly, by the EXIT trap below.
cleanup() {
  local remove_token
  remove_token="$(fetch_token remove 2>/dev/null || true)"
  [ -n "${remove_token}" ] && ./config.sh remove --token "${remove_token}" >/dev/null 2>&1
  true
}
trap cleanup EXIT

# `run.sh` runs as a child, not via `exec`. `exec` replaces this shell, and a
# replaced shell takes its traps with it -- the EXIT trap above would never have
# fired, so the deregistration it exists to perform never happened and an
# evicted pod left a runner listed (offline) that GitHub keeps dispatching jobs
# to. Those jobs hang until someone prunes the runner by hand, which is the
# exact failure this cleanup was written to prevent.
./run.sh &
RUNNER_PID=$!

# Kubernetes sends SIGTERM on eviction, rollout or node drain. Forward it so the
# runner stops between jobs on its own terms, then fall through to the EXIT trap.
trap 'kill -TERM "${RUNNER_PID}" 2>/dev/null || true' INT TERM

# `wait` returns early with 128+n when a trapped signal arrives, which is not
# the child exiting -- keep waiting until it is actually gone. `kill -0` on a
# reaped pid fails, so this always terminates.
status=0
while :; do
  set +e
  wait "${RUNNER_PID}"
  status=$?
  set -e
  kill -0 "${RUNNER_PID}" 2>/dev/null || break
done

exit "${status}"

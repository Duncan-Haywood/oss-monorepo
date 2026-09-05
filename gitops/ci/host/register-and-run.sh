#!/usr/bin/env bash
# Register a self-hosted Actions runner and run it, on a Hetzner box directly.
#
# This is the runner's analogue of ../workers/worker.sh: the installer
# (bootstrap/scripts/install-github-runner-host.sh) downloads and extracts the
# runner release and installs its OS dependencies -- all of that needs root
# and none of it needs a credential, so it happens once, as root, at install
# time. This script holds the one step that needs a credential (the GitHub
# registration token) and runs as the unprivileged `actions-runner` user the
# installer creates, each time the systemd service starts. That split mirrors
# the Codex host path (../host/README.md and its worker.sh): an installer that
# succeeds on a box which cannot actually do the job is the failure this
# repository has already paid for once (CLAUDE.md, "168 became 169"), so the
# two concerns stay apart rather than one masking the other.
#
# WHY THIS EXISTS
#
# gitops/ci/ runs self-hosted runners as pods *in the k3s cluster*, so when the
# cluster is down the runner stack meant to insure against metered GitHub
# Actions minutes goes down with it (see gitops/ci/README.md and
# gitops/agents/host/README.md — the Codex worker hit the identical failure).
# This installs onto the box's own systemd instead: no k3s, no Argo, no image
# pull. It is the one execution path that survives both outages at once.
#
# WHAT THIS SCRIPT DOES, EVERY TIME IT STARTS
#
#   1. If already configured (a `.runner` file sits next to this script from a
#      previous run), skip straight to step 3. Re-registering a runner that
#      already has a valid registration would create a duplicate GitHub does
#      not want and this script does not need.
#   2. Otherwise, mint a short-lived registration token from the GitHub API
#      using RUNNER_TOKEN (a PAT that can mint one — see gitops/ci/README.md,
#      the cluster path already documents the exact scope) and run
#      `config.sh`.
#   3. Exec `run.sh`. Unlike the cluster's ephemeral pods
#      (gitops/ci/runner-entrypoint.sh), this runner is NOT `--ephemeral`: a
#      systemd service has no pod-restart-inherits-the-old-emptyDir problem to
#      guard against (that was specific to a Deployment's containers restarting
#      in place — see the entrypoint's own comment), so it registers once and
#      `run.sh`'s own internal loop keeps taking jobs, each into its own
#      `_work/<owner>/<repo>` subdirectory.
#
# No RUNNER_TOKEN yet is not an error: it means the credential has not been
# handed to this box, exactly the same "hold" state
# gitops/agents/host/host_governor.py sits in on its own auth cooldown. This
# script logs why and exits 0 so systemd's Restart=always tries again later
# rather than crash-looping.
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be owner/repo}"

RUNNER_HOME="${RUNNER_HOST_HOME:-/opt/actions-runner-host}"
RUNNER_WORK="${RUNNER_HOST_WORK:-/var/lib/actions-runner-host/_work}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,hetzner}"
RUNNER_NAME="${RUNNER_NAME:-hetzner-$(hostname)}"

log() { printf '[register-and-run] %s\n' "$*"; }

cd "$RUNNER_HOME"

if [[ ! -f "$RUNNER_HOME/.runner" ]]; then
  if [[ ! -x "$RUNNER_HOME/config.sh" ]]; then
    log "no runner binaries in $RUNNER_HOME -- run install-github-runner-host.sh first."
    exit 1
  fi

  if [[ -z "${RUNNER_TOKEN:-}" ]]; then
    log "no RUNNER_TOKEN -- this box is not credentialed yet. Holding."
    log "write it with: install-github-runner-host.sh --credentials"
    exit 0
  fi

  # Same two-endpoint split as gitops/ci/runner-entrypoint.sh: a
  # registration-token is only accepted by config.sh, expires in an hour, and
  # is fetched fresh rather than sealed so the long-lived PAT never leaves
  # this box's credentials file.
  log "requesting a registration token for ${GITHUB_REPOSITORY}"
  reg_response="$(curl -fsSL -X POST \
    -H "Authorization: Bearer ${RUNNER_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runners/registration-token")"
  reg_token="$(printf '%s' "$reg_response" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')"
  if [[ -z "$reg_token" ]]; then
    log "could not read a registration token from the API response."
    log "check RUNNER_TOKEN can mint one on ${GITHUB_REPOSITORY} -- see gitops/ci/README.md."
    exit 1
  fi

  mkdir -p "$RUNNER_WORK"
  ./config.sh \
    --url "https://github.com/${GITHUB_REPOSITORY}" \
    --token "$reg_token" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work "$RUNNER_WORK" \
    --unattended \
    --replace
fi

log "starting run.sh"
exec ./run.sh

#!/usr/bin/env bash
# Bring the k3s cluster back up on the two hel1 boxes, end to end.
#
# WHY THIS EXISTS
#
# `preflight.sh` reads the boxes and `install-k3s-{server,agent}.sh` and
# `install-argocd.sh` each do one step of the install, but nothing joined them
# up: the documented recovery is a human SSHing to two machines in the right
# order and copy-pasting a node token between them. That made the owner ask
# `hetzner-ssh-key-is-a-public-key` necessary but *not sufficient* -- rotating
# the key buys a read-only preflight, and the restore it is supposed to enable
# still needed a separate hands-on session nobody had scheduled.
#
# Worse, following the documented order today does not work at all, and this
# script exists as much for that reason as for the convenience:
#
#   `install-k3s-server.sh` defaults ADVERTISE_IP to 10.10.0.10 and
#   `install-k3s-agent.sh` defaults SERVER_URL to https://10.10.0.10:6443 --
#   addresses on a Hetzner private network that `infra/inventory.tf` records
#   was **never applied** (`create_private_network` defaults to true, but
#   `infra/Makefile` refuses to apply and the only Hetzner token here is
#   read-only by deliberate policy -- see infra/scripts/assert_hcloud_read_only.sh
#   for why that policy is worth keeping). So the server install would burn its
#   180-second `kubectl wait` and exit 1, and the agent would sit retrying a
#   join against an address that is on no interface.
#
# The failure is recoverable -- both scripts take the addressing as env vars,
# and the server script's own error message names the fallback -- but only if
# you already know the private network is absent, and nothing said so at the
# point of use. This script detects it instead of assuming either way.
#
# WHAT IT DOES NOT DO
#
# It does not create infrastructure, resize anything, or touch the Hetzner API:
# the read-only token stays read-only and this needs nothing from it. It never
# overwrites an existing cluster -- the underlying scripts refuse, and step 2
# reports that state and skips ahead rather than forcing. It is not wired to
# any push, schedule or agent Job; the only caller is a `workflow_dispatch`
# the owner runs deliberately, and it refuses to start without CONFIRM.
#
# USAGE
#
#   CONFIRM=restore-cluster bootstrap/restore-cluster.sh
#
# from anywhere that can SSH to both boxes as root (a laptop, or the
# `restore` job in .github/workflows/hetzner-gitops-ci.yml, which loads
# HETZNERSSHKEY into an agent first).
#
#   MODE=auto|private|public   addressing; auto (default) probes the boxes
#   SKIP_ARGOCD=1              stop after the two nodes are Ready
#   WITH_CODEX_HOST=1          also install the Codex worker's systemd-timer
#                              scheduler on the agent box (gitops/agents/host/).
#                              Opt-in, runs last, cannot fail the restore, and
#                              enables nothing -- it holds until credentials
#                              and the policy switch arrive.
#   WITH_GITHUB_RUNNER_HOST=1  also install a self-hosted GitHub Actions
#                              runner as a systemd service on the agent box
#                              (gitops/ci/host/), independent of k3s and Argo.
#                              Opt-in, runs last, cannot fail the restore, and
#                              registers with GitHub only once credentialed.
#   DRY_RUN=1                  print the plan and the detected mode, change nothing
set -euo pipefail

CP="${CP:-root@89.167.29.39}"
AG="${AG:-root@157.180.80.188}"
CP_PUBLIC_IP="${CP_PUBLIC_IP:-89.167.29.39}"
AG_PUBLIC_IP="${AG_PUBLIC_IP:-157.180.80.188}"
CP_PRIV="${CP_PRIV:-10.10.0.10}"
AG_PRIV="${AG_PRIV:-10.10.0.11}"
MODE="${MODE:-auto}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_ARGOCD="${SKIP_ARGOCD:-0}"
HERE="$(dirname "$(readlink -f "$0")")"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)
# SC2029 is disabled deliberately on both: client-side expansion is the point.
# Every caller below builds the remote command *here* — ADVERTISE_IP, SERVER_URL,
# NODE_IP, the mktemp path — from values this script computed, and wants them
# expanded before the string is sent. Nothing remote-side is being quoted away.
# shellcheck disable=SC2029
ssh_cp() { ssh "${SSH_OPTS[@]}" "$CP" "$@"; }
# shellcheck disable=SC2029
ssh_ag() { ssh "${SSH_OPTS[@]}" "$AG" "$@"; }

step() { printf '\n== %s ==\n' "$1"; }
fail() { echo "restore: $1" >&2; exit 1; }

# GitHub masks a value everywhere in the log once it is registered, including
# in output from commands this script did not write. The node token and the
# Argo password both pass through here, and `set -x` on a future edit or a
# stray `echo` in an underlying script would otherwise be enough to publish
# them. No-op off a runner.
mask() { [[ -n "${GITHUB_ACTIONS:-}" ]] && printf '::add-mask::%s\n' "$1" || true; }

if [[ "${CONFIRM:-}" != "restore-cluster" && "$DRY_RUN" != "1" ]]; then
  fail "refusing to install without CONFIRM=restore-cluster (or DRY_RUN=1)."
fi

# ---------------------------------------------------------------- step 1: SSH
step "SSH reachability"
# Checked separately and before anything else because the whole reason this
# script did not exist until now is that HETZNERSSHKEY has never held a usable
# private key. A clear message here is the difference between "the key is still
# wrong" and "the restore failed", which are very different next actions.
# The message names both contexts on purpose. As of 2026-09-05 the owner's
# primary route is a laptop run (Actions runners are starved, so the workflow
# route cannot fire at all), and on a laptop there is no HETZNERSSHKEY to
# suspect -- naming only the secret would send them to fix a variable that
# does not exist in the shell they are standing in.
key_hint() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "Is the HETZNERSSHKEY secret the *private* key?"
  else
    echo "Is the matching *private* key loaded in your SSH agent? (ssh-add -l)"
  fi
}
ssh_cp 'echo ok' >/dev/null 2>&1 || fail "cannot SSH to control-plane $CP. $(key_hint)"
echo "control-plane $CP: ok"
ssh_ag 'echo ok' >/dev/null 2>&1 || fail "cannot SSH to agent $AG. $(key_hint)"
echo "agent         $AG: ok"

# ------------------------------------------------- step 2: existing cluster?
step "Existing cluster"
SERVER_PRESENT=0
if ssh_cp 'test -f /etc/rancher/k3s/k3s.yaml' 2>/dev/null; then
  SERVER_PRESENT=1
  echo "k3s server already installed on the control-plane — will not reinstall."
  echo "Continuing with labels, agent join and Argo CD, all of which are idempotent."
else
  echo "no /etc/rancher/k3s/k3s.yaml — the control-plane has no k3s server."
fi

# ------------------------------------------------------- step 3: addressing
step "Addressing"
# The choice that the documented order gets wrong. Probed rather than assumed
# in both directions: if someone has since applied the private network, this
# picks it up and takes the cheaper, already-isolated path without an edit.
detect_mode() {
  if ssh_cp "ip -4 addr show | grep -q ${CP_PRIV}" 2>/dev/null \
    && ssh_ag "ip -4 addr show | grep -q ${AG_PRIV}" 2>/dev/null; then
    echo private
  else
    echo public
  fi
}

if [[ "$MODE" == auto ]]; then
  MODE="$(detect_mode)"
  echo "detected: ${MODE}"
else
  echo "forced:   ${MODE}"
fi

case "$MODE" in
  private)
    SERVER_ADVERTISE="$CP_PRIV"
    AGENT_NODE_IP="$AG_PRIV"
    SERVER_URL="https://${CP_PRIV}:6443"
    FLANNEL_BACKEND=""
    echo "private network is up on both boxes; join traffic stays on the Hetzner fabric."
    ;;
  public)
    SERVER_ADVERTISE="$CP_PUBLIC_IP"
    AGENT_NODE_IP="$AG_PUBLIC_IP"
    SERVER_URL="https://${CP_PUBLIC_IP}:6443"
    # See the FLANNEL_BACKEND comment in install-k3s-server.sh: without this,
    # public mode runs pod-to-pod traffic between the nodes in the clear across
    # the open internet.
    FLANNEL_BACKEND="wireguard-native"
    echo "no private network on the boxes — using public addressing."
    echo "  This matches infra/inventory.tf: the hcloud_network was never applied,"
    echo "  and creating it needs a write-scoped Hetzner token this repo does not have."
    echo "  Node-to-node traffic will be encrypted with flannel wireguard-native."
    echo "  NOTE: k3s :6443 is world-open in the live firewall (infra/firewall.tf,"
    echo "  expose_k3s_api_publicly). Once a private network exists, move the join"
    echo "  onto it and close 6443 — that is what network.tf is already written for."
    ;;
  *) fail "MODE must be auto, private or public (got '${MODE}')." ;;
esac

if [[ "$DRY_RUN" == "1" ]]; then
  step "Dry run"
  echo "would install:"
  echo "  server  ${CP}  ADVERTISE_IP=${SERVER_ADVERTISE} FLANNEL_BACKEND=${FLANNEL_BACKEND:-<k3s default>}"
  echo "  agent   ${AG}  SERVER_URL=${SERVER_URL} NODE_IP=${AGENT_NODE_IP}"
  echo "  argocd  ${CP}  $([[ "$SKIP_ARGOCD" == 1 ]] && echo '(skipped)' || echo '(root Application from gitops/)')"
  echo "server already present: ${SERVER_PRESENT}"
  if [[ "${WITH_CODEX_HOST:-0}" == "1" ]]; then
    echo "  codex   ${AG}  would install the Codex host governor (holds until enabled)"
  fi
  if [[ "${WITH_GITHUB_RUNNER_HOST:-0}" == "1" ]]; then
    echo "  runner  ${AG}  would install the GitHub Actions runner, host mode (holds until credentialed)"
  fi
  exit 0
fi

# --------------------------------------------------------- step 4: k3s server
step "k3s server"
if [[ "$SERVER_PRESENT" == "1" ]]; then
  echo "already installed; applying the labels GitOps expects instead."
  ssh_cp 'bash -s' < "${HERE}/label-existing.sh"
else
  # The script is piped rather than copied so nothing is left on the box, and
  # the settings ride in the remote shell's environment rather than in argv.
  ssh_cp "ADVERTISE_IP='${SERVER_ADVERTISE}' PUBLIC_IP='${CP_PUBLIC_IP}' FLANNEL_BACKEND='${FLANNEL_BACKEND}' bash -s" \
    < "${HERE}/install-k3s-server.sh"
fi

# ---------------------------------------------------------- step 5: the token
step "Agent join"
# Never echoed, never written to a file on either box by this script, and
# masked before it can reach a log. It is a cluster-join credential: anyone
# holding it can add a node to the cluster.
NODE_TOKEN="$(ssh_cp 'cat /var/lib/rancher/k3s/server/node-token' 2>/dev/null || true)"
[[ -n "$NODE_TOKEN" ]] || fail "could not read the node token from the control-plane."
mask "$NODE_TOKEN"
# k3s writes `K10<ca-hash>::server:<password>`. Checked because the token is
# about to be interpolated into a remote script, and because a truncated or
# error-page read here would otherwise surface as a confusing join timeout.
case "$NODE_TOKEN" in
  K10*::*) : ;;
  *) fail "the node token is not in k3s's expected K10…::server:… form; refusing to use it." ;;
esac
# Single-quoted below, so a quote in the token would break out of the string.
# k3s never puts one there; assert it rather than trust it.
case "$NODE_TOKEN" in
  *\'*) fail "the node token contains a single quote; refusing to interpolate it." ;;
esac

# The token goes into the *body* of the piped script rather than onto the ssh
# command line, so it never appears in the agent's process list where any
# local user could read it with `ps`.
{
  printf "K3S_TOKEN='%s'\n" "$NODE_TOKEN"
  cat "${HERE}/install-k3s-agent.sh"
} | ssh_ag "SERVER_URL='${SERVER_URL}' NODE_IP='${AGENT_NODE_IP}' bash -s"

# ----------------------------------------------------------- step 6: readiness
step "Node readiness"
# Both nodes, because a server that is Ready on its own is exactly the state a
# failed join leaves behind — and that state serves nothing, since the agent is
# where the workload capacity is.
ssh_cp 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; kubectl wait --for=condition=Ready node --all --timeout=180s' \
  || fail "nodes did not all become Ready. Check: kubectl get nodes -o wide on ${CP}"
ssh_cp 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; kubectl get nodes -o wide'

# -------------------------------------------------------------- step 7: Argo
if [[ "$SKIP_ARGOCD" == "1" ]]; then
  step "Argo CD"
  echo "SKIP_ARGOCD=1 — stopping with the cluster up and nothing deployed into it."
else
  step "Argo CD"
  # root-application.yaml is read by install-argocd.sh from its own directory,
  # so both files have to land on the box together; a pipe cannot carry the
  # second one. This is the only thing the script copies, and it removes it.
  REMOTE_DIR="$(ssh_cp 'mktemp -d')"
  [[ -n "$REMOTE_DIR" ]] || fail "could not create a working directory on the control-plane."
  # shellcheck disable=SC2064  # expand REMOTE_DIR now, not at trap time
  trap "ssh ${SSH_OPTS[*]} ${CP} 'rm -rf ${REMOTE_DIR}' >/dev/null 2>&1 || true" EXIT
  scp "${SSH_OPTS[@]}" -q \
    "${HERE}/install-argocd.sh" "${HERE}/root-application.yaml" "${CP}:${REMOTE_DIR}/"

  # Without this the restore succeeds and the site stays dark: the GitOps
  # repository is private, so Argo applies the root Application and then fails
  # every sync on repository authentication. See install-argocd.sh.
  if [[ -z "${ARGOCD_REPO_TOKEN:-}" ]]; then
    echo
    echo "NOTE: ARGOCD_REPO_TOKEN is not set. Argo CD will install and then be"
    echo "unable to clone the private GitOps repository, so nothing will deploy."
    echo "The cluster will be up and the site will still serve nothing."
    echo "Set it to a token with Contents: Read and re-run — this script is"
    echo "idempotent and will skip the k3s installs it has already done."
    echo
  else
    mask "${ARGOCD_REPO_TOKEN}"
  fi
  # The token is written to a file over stdin rather than passed as
  # `ARGOCD_REPO_TOKEN=… ssh …`. An assignment in the remote command string
  # becomes the remote shell's argv, which every local user can read with `ps`
  # for as long as the install runs; `umask 077` before the write means only
  # root can read the file, and the trap above removes the whole directory.
  # The scp'd script reads it via ARGOCD_REPO_TOKEN_FILE.
  ARGOCD_ENV=""
  if [[ -n "${ARGOCD_REPO_TOKEN:-}" ]]; then
    printf '%s' "${ARGOCD_REPO_TOKEN}" \
      | ssh_cp "umask 077; cat > '${REMOTE_DIR}/repo-token'"
    ARGOCD_ENV="ARGOCD_REPO_TOKEN_FILE='${REMOTE_DIR}/repo-token'"
  fi
  # PRINT_ADMIN_PASSWORD stays unset: see install-argocd.sh for why the default
  # changed. Retrieval is one kubectl on the box.
  ssh_cp "${ARGOCD_ENV} bash '${REMOTE_DIR}/install-argocd.sh'"
fi

# ------------------------------------------------------ step 8: does it serve?
step "What the apex actually serves"
# The measurement this repository learned to trust over anything the manifests
# imply. ingress-nginx runs hostNetwork:true on the control-plane, so a
# Host-header curl against loopback is the real request path minus DNS and TLS,
# both of which are already known good (all three names resolve to
# 89.167.29.39). Argo needs a moment to sync before this means anything.
echo "waiting 60s for Argo to sync the root Application before measuring…"
sleep 60
for host in marisstella.dev www.marisstella.dev tools.marisstella.dev; do
  answer="$(ssh_cp "curl -s -o /dev/null --max-time 8 -w '%{http_code}, %{size_download} bytes' \
    -H 'Host: ${host}' http://127.0.0.1/" 2>/dev/null || echo 'no answer')"
  echo "  ${host}: ${answer}"
done
echo
echo "  200 with a non-trivial body = that hostname is serving."
echo "  404/503 = Argo has not finished syncing, or the Ingress matched nothing."
echo
echo "Confirm from outside the box — this is the only check a stranger's view agrees with:"
echo "  dispatch 'Public surface check' (.github/workflows/public-surface-check.yml)."
echo "Record what it returns in portfolio/ledger/infra_state.yaml."

# ------------------------------------------ step 9: dev capacity that outlives
# this cluster
#
# Opt-in, last, and unable to fail the restore. The cluster coming back is the
# whole job above; this is a second thing worth having while you are already
# holding the SSH key, and a broken install of it must not make a successful
# recovery look failed.
#
# Why it is worth a step here at all: when this cluster died it took the Codex
# worker's only scheduler with it, and the fallback — self-hosted runners in
# `gitops/ci/` — died too, because those run as pods in this same cluster. The
# insurance was downstream of the outage. `gitops/agents/host/` is a systemd
# timer on the box that runs the identical governor with no k3s underneath it,
# so installing it now is what makes the *next* cluster loss survivable rather
# than another week with nowhere to run anything.
#
# It installs onto the agent box, matching the Job's `nodeSelector:
# hcloud/node-role: agents`, and it enables nothing: policy.json ships
# "enabled": false, so the timer ticks and holds until someone flips it and
# supplies credentials. See gitops/agents/host/README.md.
if [[ "${WITH_CODEX_HOST:-0}" == "1" ]]; then
  # A dry run has already exited above, at the plan, which is where it names
  # this step. Nothing here needs to check DRY_RUN.
  step "Codex worker, host mode (agent box)"
  codex_dir="$(ssh_ag 'mktemp -d' 2>/dev/null || true)"
  if [[ -z "$codex_dir" ]]; then
    echo "  ! could not create a working directory on ${AG}; skipped." >&2
    echo "    The cluster restore above is unaffected." >&2
  else
    # The installer resolves its ROOT two levels up from itself, so the two
    # trees have to land keeping their repository-relative paths.
    if tar -C "${HERE}/.." -cz gitops/agents bootstrap/scripts/install-codex-host.sh \
         | ssh_ag "tar -xz -C '${codex_dir}'" \
       && ssh_ag "CONFIRM=install-codex-host bash '${codex_dir}/bootstrap/scripts/install-codex-host.sh'"; then
      echo
      echo "  Installed and holding. It spends no quota until you:"
      echo "    1. ./bootstrap/scripts/install-codex-host.sh --credentials < codex.env"
      echo "    2. enable the policy (./bootstrap/scripts/enable-codex-governor.sh), then re-run the installer"
    else
      echo "  ! the Codex host install did not complete." >&2
      echo "    The cluster restore above is unaffected." >&2
      echo "    The installer prints the reason and, for a missing package, the" >&2
      echo "    exact apt-get line -- read the output just above rather than" >&2
      echo "    starting over. The most likely reason on a fresh ubuntu-24.04" >&2
      echo "    box is that it ships no node and no npm: the worker runs on the" >&2
      echo "    host here, not in the node:22-bookworm image the k3s Job used." >&2
      echo "    Fix it on ${AG} and re-run this step, or follow" >&2
      echo "    gitops/agents/host/README.md, which does it without this script." >&2
    fi
    ssh_ag "rm -rf '${codex_dir}'" >/dev/null 2>&1 || true
  fi
else
  echo
  echo "Not installed: the Codex worker's host-mode scheduler (gitops/agents/host/)."
  echo "  Re-run with WITH_CODEX_HOST=1 to add it while you still hold the SSH key."
  echo "  It is what keeps dev capacity alive the next time this cluster is not."
fi

# --------------------------------------------- step 10: CI that outlives this
# cluster too
#
# Same rationale as step 9, for the other tenant `gitops/ci/` describes as
# "insurance": self-hosted Actions runners there run as pods in this same
# cluster, so metered-CI insurance was downstream of the outage it exists to
# survive. gitops/ci/host/ is a systemd service on the box instead -- no k3s,
# no Argo, no image pull -- and it registers with GitHub only once
# credentialed, exactly like the Codex host above holds until enabled.
if [[ "${WITH_GITHUB_RUNNER_HOST:-0}" == "1" ]]; then
  step "GitHub Actions runner, host mode (agent box)"
  runner_dir="$(ssh_ag 'mktemp -d' 2>/dev/null || true)"
  if [[ -z "$runner_dir" ]]; then
    echo "  ! could not create a working directory on ${AG}; skipped." >&2
    echo "    The cluster restore above is unaffected." >&2
  else
    if tar -C "${HERE}/.." -cz gitops/ci/host bootstrap/scripts/install-github-runner-host.sh \
         | ssh_ag "tar -xz -C '${runner_dir}'" \
       && ssh_ag "CONFIRM=install-github-runner-host bash '${runner_dir}/bootstrap/scripts/install-github-runner-host.sh'"; then
      echo
      echo "  Installed and holding. It registers with GitHub only once you:"
      echo "    ./bootstrap/scripts/install-github-runner-host.sh --credentials <<< 'RUNNER_TOKEN=<PAT>'"
      echo "  (a fine-grained PAT, Administration: Read and write -- gitops/ci/README.md)"
    else
      echo "  ! the GitHub runner host install did not complete." >&2
      echo "    The cluster restore above is unaffected." >&2
      echo "    The installer prints the reason and, for a missing package, the" >&2
      echo "    exact apt-get line -- read the output just above rather than" >&2
      echo "    starting over. Fix it on ${AG} and re-run this step, or follow" >&2
      echo "    gitops/ci/host/README.md, which does it without this script." >&2
    fi
    ssh_ag "rm -rf '${runner_dir}'" >/dev/null 2>&1 || true
  fi
else
  echo
  echo "Not installed: the GitHub Actions runner's host-mode service (gitops/ci/host/)."
  echo "  Re-run with WITH_GITHUB_RUNNER_HOST=1 to add it while you still hold the SSH key."
  echo "  It is what keeps CI running the next time metered minutes or this cluster are not."
fi

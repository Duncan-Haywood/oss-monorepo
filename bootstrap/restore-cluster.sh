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
#   CODEX_AUTH_JSON=<json>     the whole ~/.codex/auth.json from `codex login`,
#                              handed to the worker installed above in the same
#                              run. This is the "built-in quota" shape: the
#                              worker draws on the ChatGPT plan's included
#                              usage, so a tick costs nothing extra. Reaches
#                              the box over stdin, never argv. Without it the
#                              worker is installed and uncredentialed, and you
#                              need the SSH key a second time to finish.
#   CODEX_ENABLED=1            turn the worker on at the end of this same run,
#                              instead of leaving the switch behind a second
#                              SSH trip. Absent by default: installing is not
#                              authorising spend, and this variable is the
#                              authorisation. Ignored, with a warning, when no
#                              credential was supplied -- an enabled governor
#                              with nothing to authenticate with just loops
#                              into a six-hour auth cooldown.
#   OPENAI_API_KEY=<key>       the metered fallback for the same worker, billed
#                              per token. Written alongside CODEX_AUTH_JSON
#                              when both are held -- worker.sh prefers the
#                              plan's quota and withholds this one -- but on
#                              its own it means every tick is a charge, and the
#                              run says so loudly.
#   CODEX_GH_TOKEN=<pat>       the worker's own GitHub credential, for pushing
#                              branches and opening PRs. Named apart from
#                              GH_TOKEN on purpose: this script often runs in
#                              an Actions job where GH_TOKEN is already set to
#                              something else, and inheriting that silently
#                              would ship the wrong credential to the box. Off
#                              a runner there is no such collision, so it falls
#                              back to GH_TOKEN -- which is what
#                              `load-secrets.sh --exec` exports.
#   WITH_GITHUB_RUNNER_HOST=1  also install a self-hosted GitHub Actions
#                              runner as a systemd service on the agent box
#                              (gitops/ci/host/), independent of k3s and Argo.
#                              Opt-in, runs last, cannot fail the restore, and
#                              registers with GitHub only once credentialed.
#   RUNNER_TOKEN=<pat>         fine-grained PAT, Administration: Read and write
#                              on this repository, handed to the runner
#                              installed above in the same run. Reaches the box
#                              over stdin, never argv. Without it the runner is
#                              installed and holds, and you need the SSH key a
#                              second time to register it.
#   WITH_PORTFOLIO_SITE_HOST=1 also serve the portfolio site from the control
#                              plane box's own nginx (gitops/prod/host/),
#                              independent of k3s, Argo and Pages. Opt-in, runs
#                              last, cannot fail the restore. Needs
#                              SITE_GH_TOKEN (the origin is private); set
#                              SITE_TLS_EMAIL too to get a certificate.
#   SITE_GH_TOKEN=<pat>        fine-grained PAT, Contents: Read on this repo.
#                              Reaches the box over stdin, never argv.
#   SITE_TLS_EMAIL=<addr>      where Let's Encrypt should send expiry warnings.
#                              Without it the site is installed and served over
#                              HTTP only; add the certificate later with --tls.
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

# ------------------------------------------- step 0: the plan that needs no SSH
#
# Which extras were asked for, and which credential is standing behind each, is
# read entirely from the environment. Nothing here touches a box, so it is
# checked before SSH rather than after it.
#
# WHY THE ORDER MATTERS. Until 2026-09-10 every line of the dry run lived below
# the SSH gate, so `DRY_RUN=1` -- documented right above as "print the plan and
# the detected mode, change nothing", and offered to the owner in
# `decision_queue.py` as the way to see the plan "without changing anything" --
# printed nothing at all without a working private key. That is exactly
# backwards for the one thing this script exists for. The owner holds that key
# for a single session; the run they make with it sets seven environment
# variables, and a mistyped one is silent (`OPENAI_API_KEY` where
# `CODEX_AUTH_JSON` was meant bills per token, and the script says so -- below
# the gate, where they could not read it). The half of the rehearsal that needs
# no key is the half worth having before the key arrives.
plan_extras() {
  if [[ "${WITH_CODEX_HOST:-0}" == "1" ]]; then
    if [[ "${CODEX_ENABLED:-0}" == "1" ]]; then
      echo "  codex   ${AG}  would install the Codex host governor"
    else
      echo "  codex   ${AG}  would install the Codex host governor (holds until enabled)"
    fi
    if [[ -n "${CODEX_AUTH_JSON:-}" ]]; then
      echo "                 + would write its credentials (built-in ChatGPT quota)"
    elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
      echo "                 + would write its credentials (METERED OPENAI_API_KEY -- bills per tick)"
    else
      echo "                 (NO CODEX_AUTH_JSON -- would install uncredentialed)"
    fi
    # The switch, reported in the same block as the credential it depends on:
    # enabling without one is the mistake this rehearsal is for, and it is
    # silent at the far end (a five-minute loop into a six-hour cooldown that
    # reads as "the queue item keeps failing").
    if [[ "${CODEX_ENABLED:-0}" == "1" ]]; then
      if [[ -n "${CODEX_AUTH_JSON:-}" || -n "${OPENAI_API_KEY:-}" ]]; then
        echo "                 + would ENABLE it — it starts spending on the next tick"
      else
        echo "                 ! CODEX_ENABLED=1 but no credential -- would stay disabled"
      fi
    else
      echo "                 (CODEX_ENABLED unset -- would install and hold, spending nothing)"
    fi
  fi
  if [[ "${WITH_GITHUB_RUNNER_HOST:-0}" == "1" ]]; then
    echo "  runner  ${AG}  would install the GitHub Actions runner, host mode (holds until credentialed)"
    if [[ -n "${RUNNER_TOKEN:-}" ]]; then
      echo "                 + would write its registration token"
    else
      echo "                 (NO RUNNER_TOKEN -- would install unregistered)"
    fi
  fi
  if [[ "${WITH_PORTFOLIO_SITE_HOST:-0}" == "1" ]]; then
    echo -n "  site    ${CP}  would serve the portfolio site from this box's nginx"
    [[ -n "${SITE_GH_TOKEN:-}" ]] || echo -n "  (NO SITE_GH_TOKEN -- would fail)"
    [[ -n "${SITE_TLS_EMAIL:-}" ]] && echo "  (+TLS)" || echo "  (HTTP only)"
  fi
  if [[ "${WITH_CODEX_HOST:-0}" != "1" && "${WITH_GITHUB_RUNNER_HOST:-0}" != "1" \
        && "${WITH_PORTFOLIO_SITE_HOST:-0}" != "1" ]]; then
    echo "  (none -- the cluster only. WITH_CODEX_HOST=1, WITH_GITHUB_RUNNER_HOST=1"
    echo "   and WITH_PORTFOLIO_SITE_HOST=1 are the three extras, and each is worth"
    echo "   adding on this run rather than a second one: they all need the SSH key.)"
  fi
}

if [[ "$DRY_RUN" == "1" ]]; then
  step "Dry run — extras and credentials (no SSH needed)"
  plan_extras
  echo
  echo "mode requested: ${MODE}   (the *detected* mode is probed over SSH, below)"
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
  local hint
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    hint="Is the HETZNERSSHKEY secret the *private* key?"
  else
    hint="Is the matching *private* key loaded in your SSH agent? (ssh-add -l)"
  fi
  # A dry run that stops here has still done real work, and saying so is the
  # difference between "my env is wrong" and "I learned nothing". Naming what
  # was checked and what was not is the same discrimination
  # `run_workflow_locally.py` draws with UNRUN: a stop that means "could not
  # run" must never read as a stop that means "your input is broken".
  if [[ "$DRY_RUN" == "1" ]]; then
    hint+=$'\n''        The extras and credentials printed above WERE checked -- they are'
    hint+=$'\n''        read from the environment and need no key. What this dry run could'
    hint+=$'\n''        not reach is only the addressing probe and the existing-cluster'
    hint+=$'\n''        check, both of which read the boxes themselves.'
  fi
  echo "$hint"
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
  # Re-printed rather than only shown at step 0, so that a dry run which
  # *reaches* here still ends with the whole plan in one block -- the reader
  # should not have to scroll past the SSH and addressing output to re-read
  # which credentials were seen.
  plan_extras
  exit 0
fi

# ---------------------------------------------------------------------------
# Steps 4-8 rebuild the cluster. They run in a subshell so that a failure in
# any of them does NOT skip steps 9-11.
#
# Why this wrapper exists. Steps 9, 10 and 11 are each written to be unable to
# fail the restore, and each says so in its own output ("The cluster restore
# above is unaffected"). That was only ever half true: `set -euo pipefail` and
# `fail()`'s `exit 1` meant a cluster restore that died at, say, node readiness
# ended the script outright, and the three steps that need no k3s at all never
# ran. So the guarantee held in the direction nobody needed (a broken Codex
# install cannot break the cluster) and not in the direction that costs the
# owner (a broken cluster silently withholds the things that do not depend on
# it).
#
# That is this repository's most expensive recurring shape, recorded twice in
# CLAUDE.md and once in infra_state.yaml: the insurance was downstream of the
# outage it insured. `gitops/ci/`'s self-hosted runners ran as pods in the
# cluster they were meant to survive; `gitops/agents/host/` was built precisely
# to be downstream of neither a runner nor the cluster — and then wiring it in
# here as step 9 put it back downstream of the cluster.
#
# It matters most on the run that matters most. Nobody has ever executed this
# script against these boxes (`hetzner-ssh-key-is-a-public-key` has blocked it
# all week) and `hetzner-private-network` is down, so the addressing steps are
# the least-proven part of it. The owner rotates the key, makes the one
# documented run, it dies at step 6 — and they get no cluster, no Codex worker,
# no self-hosted runner and, through step 11, no public surface either, despite
# three of those four needing nothing that just failed. They would have to
# diagnose k3s, still holding the key, before getting the capacity that never
# needed k3s.
#
# Steps 1-3 stay outside the subshell and still abort hard, correctly: they
# establish SSH reachability, and without SSH steps 9-11 cannot run either.
CLUSTER_STATUS=0
(
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
) || CLUSTER_STATUS=$?

if [[ "$CLUSTER_STATUS" != "0" ]]; then
  echo >&2
  echo "== cluster restore FAILED (exit ${CLUSTER_STATUS}) ==" >&2
  echo "  Read the step that failed above; it names the box and the check." >&2
  echo "  Continuing anyway with the host-mode steps below, which need no k3s." >&2
  echo "  They install onto the same boxes over the SSH you already have, so" >&2
  echo "  they are worth taking now rather than after a second trip." >&2
  echo "  This script still exits non-zero at the end." >&2
fi

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
      # Credentials *after* the install, not before it as step 11 does. The
      # site's token is needed up front because the install itself clones with
      # it; this one is not needed until a tick runs, and the installer creates
      # the service account that /etc/codex-agents/credentials.env is owned
      # against. Writing first would leave the file correct by luck rather than
      # by ordering.
      #
      # Why this is here at all: without it the owner finishes a successful
      # restore holding the SSH key, and still has to come back with the key a
      # second time to hand the worker its credential -- for the one step in
      # this script whose entire point is dev capacity that survives the next
      # outage. Step 11 already passes its secret inline; this is the same
      # idiom, over stdin so the value never lands in the box's own `ps`.
      #
      # `CODEX_GH_TOKEN` rather than plain `GH_TOKEN` because this script also
      # runs as an Actions job, where GH_TOKEN is already set to the workflow's
      # own token -- inheriting that would ship the wrong credential to the box
      # without anyone typing it. Off a runner there is no such collision, and
      # `load-secrets.sh` exports GH_TOKEN as the agents identity, which is
      # exactly what the worker wants, so the laptop route falls back to it.
      codex_gh="${CODEX_GH_TOKEN:-}"
      if [[ -z "$codex_gh" && -z "${GITHUB_ACTIONS:-}" ]]; then
        codex_gh="${GH_TOKEN:-}"
      fi
      if [[ -n "${CODEX_AUTH_JSON:-}" || -n "${OPENAI_API_KEY:-}" ]]; then
        # An `if` rather than `[[ ... ]] && mask ...`: under `set -e` a bare
        # AND-list whose test fails is itself a failed statement, so the empty
        # case would abort the run instead of skipping the mask.
        if [[ -n "${CODEX_AUTH_JSON:-}" ]]; then mask "${CODEX_AUTH_JSON}"; fi
        if [[ -n "${OPENAI_API_KEY:-}" ]]; then mask "${OPENAI_API_KEY}"; fi
        if [[ -n "$codex_gh" ]]; then mask "$codex_gh"; fi
        # `codex login` may leave auth.json pretty-printed, and systemd reads
        # credentials.env one KEY=value per line -- a multi-line value would
        # silently truncate at the first newline. Folding it is safe because
        # JSON ignores whitespace between tokens and auth.json holds no
        # newline inside any string.
        #
        # Both names are written when both are held. That is not redundancy:
        # worker.sh resolves auth.json first and `unset`s OPENAI_API_KEY before
        # invoking codex, so shipping both means the plan's included quota is
        # used and the API key is the fallback it is -- while shipping only the
        # API key means every tick is a charge.
        # Built by appending whole lines, each with its own trailing newline.
        # `codex_env+="$(printf ...)"` looks equivalent and is not: command
        # substitution strips trailing newlines, so the second assignment ran
        # straight on from the first and produced `GH_TOKEN=...OPENAI_API_KEY=`
        # on one line -- a credentials file systemd would read as one variable
        # with a nonsense value. Caught by the test below, not by review.
        codex_env="CODEX_AUTH_JSON=$(printf '%s' "${CODEX_AUTH_JSON:-}" | tr -d '\n\r')"$'\n'
        codex_env+="GH_TOKEN=${codex_gh}"$'\n'
        if [[ -n "${OPENAI_API_KEY:-}" ]]; then
          codex_env+="OPENAI_API_KEY=${OPENAI_API_KEY}"$'\n'
        fi
        if printf '%s' "$codex_env" \
           | ssh_ag "bash '${codex_dir}/bootstrap/scripts/install-codex-host.sh' --credentials"; then
          echo
          if [[ -n "${CODEX_AUTH_JSON:-}" ]]; then
            echo "  Installed and credentialed against the ChatGPT plan's included"
            echo "  quota, so a tick costs nothing extra."
          else
            echo "  ! Installed and credentialed with the METERED OPENAI_API_KEY" >&2
            echo "    only -- every tick bills per token. Set CODEX_AUTH_JSON" >&2
            echo "    (from \`codex login\`) and re-run to draw on a ChatGPT" >&2
            echo "    plan's included usage instead; worker.sh prefers it and" >&2
            echo "    withholds the API key when both are present." >&2
          fi
          if [[ -z "$codex_gh" ]]; then
            echo "  ! No CODEX_GH_TOKEN was given, so the worker can run but cannot" >&2
            echo "    push a branch or open a PR. Re-run with it to finish." >&2
          fi
          # The flip, in this same session. Installing is still not authorising
          # spend -- CODEX_ENABLED=1 is the authorisation, and it is absent by
          # default. What changed is only where the owner has to be standing to
          # give it: this used to require editing policy.json, committing, and
          # re-running the installer over a *second* SSH session, and SSH to
          # this box needs HETZNERSSHKEY, the one owner action every route in
          # this repository is blocked on. Same reasoning as the credential
          # step above, one step further down the sequence.
          if [[ "${CODEX_ENABLED:-0}" == "1" ]]; then
            if ssh_ag "bash '${codex_dir}/bootstrap/scripts/install-codex-host.sh' --enable"; then
              echo "  CODEX_ENABLED=1 — the governor is on. It will start a worker"
              echo "  on its next five-minute tick and draw on the plan's quota"
              echo "  up to the policy's budget fraction."
            else
              echo "  ! the worker is installed and credentialed, but enabling it" >&2
              echo "    failed. Nothing is spending anything. Retry with:" >&2
              echo "      ./bootstrap/scripts/install-codex-host.sh --enable" >&2
            fi
          else
            echo "  One step remains, and it is deliberately yours: turning it on."
            echo "  Installing is not authorising spend. When you want the quota"
            echo "  spent, either re-run this script with CODEX_ENABLED=1, or on"
            echo "  the box run: ./bootstrap/scripts/install-codex-host.sh --enable"
          fi
        else
          echo "  ! the worker is installed but its credentials did not land." >&2
          echo "    The cluster restore above is unaffected, and nothing is" >&2
          echo "    spending anything. Retry just this part with:" >&2
          echo "      ./bootstrap/scripts/install-codex-host.sh --credentials < codex.env" >&2
        fi
      else
        echo
        echo "  Installed and holding. It spends no quota until you:"
        echo "    1. ./bootstrap/scripts/install-codex-host.sh --credentials < codex.env"
        echo "    2. ./bootstrap/scripts/install-codex-host.sh --enable"
        echo "  Both are avoidable, and both cost an SSH trip you are already"
        echo "  making right now: re-run this script with CODEX_AUTH_JSON set"
        echo "  (and CODEX_GH_TOKEN, and CODEX_ENABLED=1 when you want it"
        echo "  spending) and all of it lands in the same run as the install."
      fi
    else
      echo "  ! the Codex host install did not complete." >&2
      echo "    The cluster restore above is unaffected." >&2
      echo "    A fresh ubuntu-24.04 box ships no node and no npm -- the worker" >&2
      echo "    runs on the host here, not in the node:22-bookworm image the k3s" >&2
      echo "    Job used -- but the installer now apt-gets those itself, so that" >&2
      echo "    is no longer the likely reason. Check whether ${AG} can reach the" >&2
      echo "    Ubuntu archive: the installer prints apt's own output, and" >&2
      echo "    'apt-get update failed' there means the box is offline rather" >&2
      echo "    than missing anything. Read the output just above rather than" >&2
      echo "    starting over, fix it on ${AG} and re-run this step, or follow" >&2
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
      # After the install for the same reason as step 9, and one more that is
      # specific to this installer: its `write_credentials` chowns the file to
      # the runner's service account, which the install is what creates. Write
      # it first and that chown is a silent no-op, leaving a root-owned file
      # the service cannot read -- a failure that looks exactly like a bad PAT.
      if [[ -n "${RUNNER_TOKEN:-}" ]]; then
        mask "${RUNNER_TOKEN}"
        if printf 'RUNNER_TOKEN=%s\n' "${RUNNER_TOKEN}" \
           | ssh_ag "bash '${runner_dir}/bootstrap/scripts/install-github-runner-host.sh' --credentials"; then
          echo
          echo "  Installed and credentialed. Flip CI onto it by setting the"
          echo "  repository variable CI_RUNNER=self-hosted -- all 218 workflows"
          echo "  already read it, and a self-hosted runner is not metered."
        else
          echo "  ! the runner is installed but its token did not land." >&2
          echo "    The cluster restore above is unaffected, and it registers" >&2
          echo "    with nothing until it has one. Retry just this part with:" >&2
          echo "      ./bootstrap/scripts/install-github-runner-host.sh --credentials <<< 'RUNNER_TOKEN=<PAT>'" >&2
        fi
      else
        echo
        echo "  Installed and holding. It registers with GitHub only once you:"
        echo "    ./bootstrap/scripts/install-github-runner-host.sh --credentials <<< 'RUNNER_TOKEN=<PAT>'"
        echo "  (a fine-grained PAT, Administration: Read and write -- gitops/ci/README.md)"
        echo "  That second trip is avoidable: re-run this script with RUNNER_TOKEN"
        echo "  set and it lands in the same run as the install."
      fi
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

# ------------------------------------------ step 11: something a stranger can
# open
#
# Steps 9 and 10 restore the two things that *build* -- dev capacity and CI --
# to a box's own systemd, where neither k3s nor an Actions runner is in the way.
# Nothing did the same for the thing that *serves*, so this script could finish
# every earlier step and leave a visitor to marisstella.dev still looking at a
# refused connection. That is the one gap whose closing a user can see.
#
# It goes on ${CP}: the apex, www and tools all resolve to that box
# (`Outage triage`, run 33889983086), so it is where the DNS already points.
#
# Like 9 and 10 this is opt-in and runs last, and it cannot fail the restore.
# Unlike them it needs its credential *up front* rather than after: the origin
# is private, so the deploy checkout cannot be cloned without a token, and an
# install that got that far and stopped would leave nothing serving. The token
# reaches the box over stdin via --credentials -- never in the remote command
# string, where it would show in the box's own `ps` -- which is the same rule
# ARGOCD_REPO_TOKEN follows in step 8.
#
# Running this IS the decision to publish under the portfolio's public name, on
# a domain whose DNS already points here. That is why it takes an explicit
# opt-in flag and why there is deliberately no second gate after it
# (portfolio/DIRECTION.md: "do not add a second ask").
if [[ "${WITH_PORTFOLIO_SITE_HOST:-0}" == "1" ]]; then
  step "Portfolio site, host mode (control plane box)"
  if [[ -z "${SITE_GH_TOKEN:-}" ]]; then
    echo "  ! SITE_GH_TOKEN is not set, and the origin is private, so the deploy" >&2
    echo "    checkout cannot be cloned. Skipped; the cluster restore above is" >&2
    echo "    unaffected. Re-run with SITE_GH_TOKEN=<fine-grained PAT, Contents:" >&2
    echo "    Read on this repository> to serve the site from ${CP}." >&2
  else
    mask "${SITE_GH_TOKEN}"
    site_dir="$(ssh_cp 'mktemp -d' 2>/dev/null || true)"
    if [[ -z "$site_dir" ]]; then
      echo "  ! could not create a working directory on ${CP}; skipped." >&2
      echo "    The cluster restore above is unaffected." >&2
    else
      site_sh="${site_dir}/bootstrap/scripts/install-portfolio-site-host.sh"
      # Credentials first and separately: --credentials only writes the file,
      # so the install below can source it for the clone.
      if tar -C "${HERE}/.." -cz gitops/prod/host bootstrap/scripts/install-portfolio-site-host.sh \
           | ssh_cp "tar -xz -C '${site_dir}'" \
         && printf 'GH_TOKEN=%s\n' "${SITE_GH_TOKEN}" \
           | ssh_cp "bash '${site_sh}' --credentials" \
         && ssh_cp "CONFIRM=install-portfolio-site-host SITE_TLS_EMAIL='${SITE_TLS_EMAIL:-}' bash '${site_sh}'"; then
        echo
        if [[ -n "${SITE_TLS_EMAIL:-}" ]]; then
          echo "  Serving. Add the certificate with:"
          echo "    SITE_TLS_EMAIL='${SITE_TLS_EMAIL}' CONFIRM=install-portfolio-site-host \\"
          echo "      ${site_sh} --tls"
        else
          echo "  Serving over HTTP. For a certificate, re-run this step with"
          echo "  SITE_TLS_EMAIL set, then pass --tls to the installer."
        fi
        echo "  Verify from off the box:  curl -sSI https://marisstella.dev/healthz"
        echo "  Then update portfolio/ledger/infra_state.yaml -- the reading that"
        echo "  matters is what a stranger gets, not that this step exited 0."
      else
        echo "  ! the portfolio site host install did not complete." >&2
        echo "    The cluster restore above is unaffected, and nothing was" >&2
        echo "    published. The installer prints the reason -- a rejected token" >&2
        echo "    shows as a failed clone, and an offline box as 'apt-get update" >&2
        echo "    failed'. Read the output just above rather than starting over," >&2
        echo "    or follow gitops/prod/host/README.md, which does it by hand." >&2
      fi
      ssh_cp "rm -rf '${site_dir}'" >/dev/null 2>&1 || true
    fi
  fi
else
  echo
  echo "Not installed: the portfolio site's host-mode server (gitops/prod/host/)."
  echo "  Re-run with WITH_PORTFOLIO_SITE_HOST=1 and SITE_GH_TOKEN=<pat> to serve"
  echo "  the catalogue from ${CP} while you still hold the SSH key."
  echo "  Steps 9 and 10 restore what builds; this is the one that serves."
fi

# A failed cluster restore is still a failed run, however well steps 9-11 went.
# Reported last rather than at the point of failure so the exit code cannot be
# read as "the host-mode steps failed", and so a caller that only checks `$?`
# gets the same answer it did before this script continued past step 8.
if [[ "$CLUSTER_STATUS" != "0" ]]; then
  echo >&2
  echo "restore: the cluster restore failed (exit ${CLUSTER_STATUS}); any" >&2
  echo "  host-mode steps above are reported on their own terms and may well" >&2
  echo "  have succeeded. Re-run this script once the cluster fault is fixed —" >&2
  echo "  each host-mode installer is idempotent, so re-running costs nothing." >&2
  exit "$CLUSTER_STATUS"
fi

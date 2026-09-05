#!/usr/bin/env bash
# Install a self-hosted GitHub Actions runner as a systemd service on a
# Hetzner box, independent of k3s.
#
# WHY THIS EXISTS
#
# `gitops/ci/` runs self-hosted runners as pods *inside the k3s cluster*, so
# when the cluster goes down (as of 2026-09-05: `:6443` refused on both boxes,
# `Outage triage` run 33889983086) the fallback built to insure against
# metered GitHub-hosted minutes goes down with it. That is the same shape of
# failure `gitops/agents/host/` was built to fix for the Codex worker, and
# this is the CI-runner half of the same fix: a systemd service on the box
# itself, no k3s, no Argo, no image pull.
#
# It restores actual GitHub Actions capability, not merely a diagnostic --
# once registered, workflows in this repository dispatch to it exactly as they
# would to the in-cluster pods, using the same `runs-on: self-hosted` label
# set every workflow already carries (`runs-on: ${{ vars.CI_RUNNER ||
# 'ubuntu-latest' }}`).
#
# WHAT IT DOES NOT DO
#
# It does not install or touch k3s, Argo CD, the Ingress, or anything serving
# the public site. It does not create Hetzner resources and never calls the
# Hetzner API. It does not register the runner with GitHub -- that step needs
# a credential this script never holds; it writes `credentials.env` and the
# systemd service (gitops/ci/host/register-and-run.sh) reads it at start time.
# `--credentials` reads from stdin, never argv, so nothing lands in the shell
# history or the process table.
#
# USAGE
#
#   CONFIRM=install-github-runner-host ./bootstrap/scripts/install-github-runner-host.sh
#   ./bootstrap/scripts/install-github-runner-host.sh --check        # report, change nothing
#   ./bootstrap/scripts/install-github-runner-host.sh --credentials  # write creds from stdin
#   CONFIRM=install-github-runner-host ./bootstrap/scripts/install-github-runner-host.sh --uninstall
#
# Run it on the box, as root, from a checkout of this repository (it needs the
# checkout for gitops/ci/host/register-and-run.sh and the unit file; the
# runner release tarball itself is downloaded fresh, see below).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_HOST="$ROOT/gitops/ci/host"

PREFIX="${RUNNER_HOST_PREFIX:-/opt/actions-runner-host}"
ETCDIR="${RUNNER_HOST_ETC:-/etc/actions-runner-host}"
UNITDIR="${RUNNER_HOST_UNITDIR:-/etc/systemd/system}"
WORKDIR="${RUNNER_HOST_WORKDIR:-/var/lib/actions-runner-host}"
SVC_USER="${RUNNER_HOST_USER:-actions-runner}"
CREDS="$ETCDIR/credentials.env"
UNIT=github-runner.service

# Pinned to the same version gitops/ci/runner.yaml runs in-cluster, so the two
# paths behave identically.
RUNNER_VERSION="${RUNNER_HOST_VERSION:-2.328.0}"
RUNNER_ARCH="${RUNNER_HOST_ARCH:-x64}"
RUNNER_TARBALL_NAME="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
RUNNER_TARBALL_URL="${RUNNER_HOST_TARBALL_URL:-https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TARBALL_NAME}}"
# From the release's own "SHA-256 Checksums" section
# (https://github.com/actions/runner/releases/tag/v2.328.0), read there on
# 2026-09-05. Re-verify against that page before a first real install -- a
# wrong value only ever fails closed (extraction below refuses on a mismatch),
# never silently, but it is worth being right the first time.
RUNNER_TARBALL_SHA256="${RUNNER_HOST_TARBALL_SHA256:-01066fad3a2893e63e6ca880ae3a1fad5bf9329d60e77ee15f2b97c148c3cd4e}"
# A local tarball path instead of the network, for tests and for a box
# provisioned without outbound internet at install time.
RUNNER_TARBALL_LOCAL="${RUNNER_HOST_TARBALL_PATH:-}"

MODE=install
for arg in "$@"; do
  case "$arg" in
    --check)       MODE=check ;;
    --uninstall)   MODE=uninstall ;;
    --credentials) MODE=credentials ;;
    -h|--help)     sed -n '2,38p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg (want: --check | --credentials | --uninstall)" >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
ok()   { printf '  + %s\n' "$*"; }
fail() { echo "install-github-runner-host: $1" >&2; exit 1; }

require_root() {
  [[ "$(id -u)" == "0" ]] || fail "must run as root (it writes $PREFIX, $WORKDIR and $UNITDIR)."
}

systemd_available() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl daemon-reload >/dev/null 2>&1 || return 1
  return 0
}

# ------------------------------------------------------------- prerequisites
#
# curl and tar are what this installer itself calls to fetch and unpack the
# runner release. The runner's own bundled .NET runtime has its own OS-level
# library needs (libicu, libssl, etc., distro- and version-specific), which
# is exactly what the tarball ships `bin/installdependencies.sh` to resolve --
# asking the question ourselves here would mean maintaining a second, weaker
# copy of a list the vendor already keeps current. So this installer runs
# that script rather than restating what it knows, the same lesson CLAUDE.md
# already records paying for once ("168 became 169": a copied rule going
# stale instead of importing the real one).
PREREQS=(curl tar)

host_prereqs() {
  local absent=() tool
  for tool in "${PREREQS[@]}"; do
    if command -v "$tool" >/dev/null 2>&1; then
      ok "$tool"
    else
      warn "missing: $tool"
      absent+=("$tool")
    fi
  done
  [[ "${#absent[@]}" == "0" ]] && return 0
  say ""
  say "  apt-get update && apt-get install -y --no-install-recommends ${absent[*]}"
  say ""
  return 1
}

# ------------------------------------------------------------------ reporting

report() {
  step "source tree"
  local missing=0
  if [[ -f "$SRC_HOST/register-and-run.sh" ]]; then
    ok "register-and-run.sh"
  else
    warn "missing from the checkout: gitops/ci/host/register-and-run.sh"
    missing=1
  fi
  if [[ -f "$SRC_HOST/$UNIT" ]]; then ok "$UNIT"; else warn "missing: $UNIT"; missing=1; fi
  [[ "$missing" == "0" ]] || fail "the checkout is incomplete; nothing was changed."

  step "host prerequisites"
  host_prereqs || true

  step "installed state"
  if [[ -x "$PREFIX/config.sh" ]]; then
    ok "runner binaries extracted at $PREFIX"
  else
    say "  - no runner binaries at $PREFIX"
  fi
  if [[ -f "$PREFIX/.runner" ]]; then
    ok "registered with GitHub ($(grep -o '"agentName"[[:space:]]*:[[:space:]]*"[^"]*"' "$PREFIX/.runner" 2>/dev/null | sed 's/.*:\s*"\(.*\)"/\1/'))"
  else
    say "  - not yet registered with GitHub"
  fi
  if [[ -f "$UNITDIR/$UNIT" ]]; then ok "$UNIT installed"; else say "  - $UNIT not installed"; fi
  if [[ -f "$CREDS" ]]; then
    ok "credentials present ($(stat -c '%a' "$CREDS") $(stat -c '%U' "$CREDS"))"
  else
    say "  - no credentials at $CREDS (the service will hold until they arrive)"
  fi
  if id "$SVC_USER" >/dev/null 2>&1; then
    ok "system user $SVC_USER exists"
  else
    say "  - system user $SVC_USER not created"
  fi
  if systemd_available; then
    if systemctl is-enabled "$UNIT" >/dev/null 2>&1; then
      ok "service enabled: $(systemctl is-active "$UNIT" 2>/dev/null || true)"
    else
      say "  - service not enabled"
    fi
  else
    say "  - systemd is not managing this host (unit installs, but nothing starts it)"
  fi
}

# --------------------------------------------------------------- credentials

write_credentials() {
  require_root
  [[ ! -t 0 ]] || fail "--credentials reads the env file from stdin; pipe it in."
  install -d -m 0750 "$ETCDIR"
  local tmp
  tmp="$(mktemp "$ETCDIR/.credentials.XXXXXX")"
  chmod 0600 "$tmp"
  cat > "$tmp"
  [[ -s "$tmp" ]] || { rm -f "$tmp"; fail "stdin was empty; $CREDS left unchanged."; }
  mv "$tmp" "$CREDS"
  chmod 0600 "$CREDS"
  chown "root:$SVC_USER" "$CREDS" 2>/dev/null || true
  ok "wrote $CREDS (0600)"
  say "  systemctl restart $UNIT to pick it up"
}

# -------------------------------------------------------------------- install

fetch_and_extract_runner() {
  if [[ -x "$PREFIX/config.sh" ]]; then
    ok "runner already extracted at $PREFIX"
    return 0
  fi
  step "runner release"
  # No trap-based cleanup here: a RETURN trap set inside one function keeps
  # firing on every later function return in the same script, not just this
  # one's -- explicit rm -f on every exit path is the reliable version.
  local tmp_tarball
  tmp_tarball="$(mktemp "${TMPDIR:-/tmp}/actions-runner.XXXXXX.tar.gz")"
  if [[ -n "$RUNNER_TARBALL_LOCAL" ]]; then
    say "  using local tarball $RUNNER_TARBALL_LOCAL (RUNNER_HOST_TARBALL_PATH set)"
    cp "$RUNNER_TARBALL_LOCAL" "$tmp_tarball"
  else
    say "  fetching $RUNNER_TARBALL_URL"
    curl -fsSL -o "$tmp_tarball" "$RUNNER_TARBALL_URL"
  fi
  if ! echo "${RUNNER_TARBALL_SHA256}  ${tmp_tarball}" | sha256sum -c - >/dev/null; then
    rm -f "$tmp_tarball"
    fail "checksum mismatch on the downloaded runner tarball (expected ${RUNNER_TARBALL_SHA256}); nothing was extracted."
  fi
  ok "checksum verified"
  tar -xzf "$tmp_tarball" -C "$PREFIX"
  rm -f "$tmp_tarball"
  ok "extracted to $PREFIX"

  # installdependencies.sh needs root (apt-get) and must run before the
  # service ever tries to start run.sh as the unprivileged $SVC_USER below.
  if [[ -x "$PREFIX/bin/installdependencies.sh" ]]; then
    step "runner OS dependencies"
    "$PREFIX/bin/installdependencies.sh"
    ok "installdependencies.sh"
  fi
}

do_install() {
  require_root
  [[ "${CONFIRM:-}" == "install-github-runner-host" ]] || \
    fail "refusing to install without CONFIRM=install-github-runner-host (or use --check)."

  step "host prerequisites"
  host_prereqs || fail "install curl and tar above and re-run. Nothing was changed."

  step "system user"
  if id "$SVC_USER" >/dev/null 2>&1; then
    ok "$SVC_USER already exists"
  else
    useradd --system --home-dir "$PREFIX" --shell /usr/sbin/nologin "$SVC_USER"
    ok "created $SVC_USER"
  fi

  step "directories"
  install -d -m 0755 "$PREFIX"
  install -d -m 0750 "$ETCDIR"
  install -d -m 0755 "$WORKDIR" "$WORKDIR/_work"
  ok "$PREFIX, $ETCDIR, $WORKDIR"

  fetch_and_extract_runner

  step "wrapper script"
  install -m 0755 "$SRC_HOST/register-and-run.sh" "$PREFIX/register-and-run.sh"
  ok "register-and-run.sh"

  chown -R "$SVC_USER:$SVC_USER" "$PREFIX" "$WORKDIR"
  ok "ownership: $SVC_USER"

  step "systemd unit"
  install -d -m 0755 "$UNITDIR"
  install -m 0644 "$SRC_HOST/$UNIT" "$UNITDIR/$UNIT"
  ok "$UNIT"

  if ! systemd_available; then
    warn "systemd is not managing this host; the unit is in place but not started."
    warn "the payload under $PREFIX is complete — activate it wherever it will run."
    return 0
  fi

  systemctl daemon-reload
  systemctl enable --now "$UNIT"
  ok "$UNIT enabled"

  step "next"
  if [[ ! -f "$CREDS" ]]; then
    say "  1. Give it a registration credential (reads stdin, nothing lands in argv):"
    say "       $0 --credentials <<< 'RUNNER_TOKEN=<fine-grained PAT, Administration: Read and write>'"
    say "     See gitops/ci/README.md for the exact scope."
  fi
  say "  Watch it:  systemctl status $UNIT"
  say "             journalctl -u $UNIT -f"
  say "  Check it:  $0 --check"
}

# ------------------------------------------------------------------ uninstall

do_uninstall() {
  require_root
  [[ "${CONFIRM:-}" == "install-github-runner-host" ]] || \
    fail "refusing to uninstall without CONFIRM=install-github-runner-host."

  step "systemd"
  if systemd_available; then
    systemctl disable --now "$UNIT" 2>/dev/null || true
    ok "service stopped and disabled"
  fi
  rm -f "$UNITDIR/$UNIT" && ok "removed $UNIT"
  if systemd_available; then ok "systemd reloaded"; fi

  step "files"
  rm -rf "${PREFIX:?}"
  ok "removed $PREFIX"
  say "  kept $CREDS — remove it by hand if you mean to."
  say "  kept the $SVC_USER system account and $WORKDIR/_work — remove by hand if you mean to."
}

case "$MODE" in
  check)       report ;;
  credentials) write_credentials ;;
  install)     do_install ;;
  uninstall)   do_uninstall ;;
esac

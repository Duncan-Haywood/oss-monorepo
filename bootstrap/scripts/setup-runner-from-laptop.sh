#!/usr/bin/env bash
# Install the self-hosted GitHub Actions runner on a Hetzner box -- from your
# own machine, in one run.
#
# WHY THIS EXISTS
#
# `bootstrap/scripts/install-github-runner-host.sh` runs *on the box*, and
# `gitops/ci/host/README.md` documents it that way: rsync a checkout up, ssh
# in, run it. Every step of that is correct and none of it is the hard part.
# The hard part, measured on 2026-09-06, is everything before it -- which of
# your local keys opens the box, whether its host key has ever been seen, and
# not pasting a comment line into zsh (which does not enable
# `interactive_comments` by default, so a leading `#` is read as a command).
#
# A session cannot do any of that for you: the private key is yours and this
# environment has never held it. So this is the next best thing -- one script,
# run from the repository checkout on your machine, that does the discovery,
# the copy, the install and the credential hand-off in order, and stops with a
# specific message the moment one of them cannot be done.
#
# It holds no credential of its own. The SSH key stays on your machine; the
# PAT is read from stdin or a prompt and shipped to the box over ssh's stdin,
# never in argv, so it appears in neither shell history nor `ps` on either end.
#
# USAGE
#
#   ./bootstrap/scripts/setup-runner-from-laptop.sh              # full run
#   ./bootstrap/scripts/setup-runner-from-laptop.sh --check      # report only
#   ./bootstrap/scripts/setup-runner-from-laptop.sh --no-token   # skip the PAT
#   RUNNER_TOKEN=<fine-grained PAT> ./bootstrap/scripts/setup-runner-from-laptop.sh
#
# Environment:
#   BOX_IP        box to install on (default 157.180.80.188, the 4 GB agent box;
#                 89.167.29.39 is the 24 GB k3s server -- see infra/README.md)
#   SSH_KEY       skip key discovery and use this one
#   RUNNER_TOKEN  the PAT; omit to be prompted (or use --no-token)
#   REMOTE_DIR    checkout path on the box (default /root/monorepo-projects)
set -euo pipefail

BOX_IP="${BOX_IP:-157.180.80.188}"
BOX_USER="${BOX_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/monorepo-projects}"
SSH_KEY="${SSH_KEY:-}"
TARGET="$BOX_USER@$BOX_IP"

CHECK_ONLY=0
WANT_TOKEN=1
for arg in "$@"; do
  case "$arg" in
    --check)    CHECK_ONLY=1 ;;
    --no-token) WANT_TOKEN=0 ;;
    -h|--help)  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          printf 'setup-runner: unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
say()  { printf '    %s\n' "$*"; }
die()  { printf '\nsetup-runner: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
step "Checking this machine"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$repo_root/bootstrap/scripts/install-github-runner-host.sh" ] || die \
  "run this from a checkout of the monorepo (looked in $repo_root)"
[ -d "$repo_root/gitops/ci/host" ] || die \
  "gitops/ci/host is missing from $repo_root -- the installer needs it"

for tool in ssh rsync ssh-keygen ssh-keyscan; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH"
done
say "checkout    $repo_root"
say "target      $TARGET"

# --------------------------------------------------------------- host key
step "Host key"

known_hosts="$HOME/.ssh/known_hosts"
mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"; touch "$known_hosts"

if ssh-keygen -F "$BOX_IP" -f "$known_hosts" >/dev/null 2>&1; then
  say "already known -- nothing to accept"
else
  scan="$(mktemp)"; trap 'rm -f "$scan"' EXIT
  ssh-keyscan -T 10 -t ed25519 "$BOX_IP" > "$scan" 2>/dev/null || true
  [ -s "$scan" ] || die "no SSH host key from $BOX_IP:22 -- the box is not answering"

  say "$BOX_IP presented:"
  ssh-keygen -lf "$scan" | sed 's/^/      /'
  say ""
  say "Nothing in this repository records this fingerprint, so there is no"
  say "stored value to check it against (hetzner-gitops-ci.yml keyscans blind"
  say "too). To verify rather than trust it, open the Hetzner Cloud Console"
  say "for this server and run:"
  say "      ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub"
  say ""
  printf '    Accept this host key? [y/N] '
  read -r reply
  case "$reply" in
    [yY]|[yY][eE][sS]) cat "$scan" >> "$known_hosts"; say "recorded" ;;
    *) die "declined -- verify the fingerprint, then re-run" ;;
  esac
fi

# ------------------------------------------------------------- key discovery
step "Finding a key that opens the box"

opens() {
  local key="${1:-}"
  if [ -n "$key" ]; then
    ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 \
      "$TARGET" true >/dev/null 2>&1
  else
    ssh -o BatchMode=yes -o ConnectTimeout=10 "$TARGET" true >/dev/null 2>&1
  fi
}

if [ -n "$SSH_KEY" ]; then
  opens "$SSH_KEY" || die "SSH_KEY=$SSH_KEY does not authenticate to $TARGET"
  say "using SSH_KEY  $SSH_KEY"
elif opens ""; then
  SSH_KEY=""
  say "your agent or a default key already opens it -- no -i needed"
else
  for candidate in "$HOME"/.ssh/*; do
    case "$candidate" in
      *.pub|*known_hosts*|*config|*authorized_keys*) continue ;;
    esac
    [ -f "$candidate" ] || continue
    ssh-keygen -y -f "$candidate" >/dev/null 2>&1 || continue   # not a private key
    if opens "$candidate"; then SSH_KEY="$candidate"; break; fi
  done
  [ -n "$SSH_KEY" ] || die \
"none of the keys in ~/.ssh authenticate to $TARGET.

This is the outcome 'hetzner-ssh-key-is-a-public-key' predicts: the private
half may never have been kept locally. Recovery, no data loss:

  1. Hetzner Cloud Console -> this server -> boot into RESCUE mode,
     attaching a key you control.
  2. Mount the system disk and append your public key to
     /root/.ssh/authorized_keys
  3. Reboot normally and re-run this script.

Everything else here is fine -- :22 answered and offered a host key."
  say "using          $SSH_KEY"
fi

ssh_opts=()
[ -n "$SSH_KEY" ] && ssh_opts=(-i "$SSH_KEY" -o IdentitiesOnly=yes)

# Client-side expansion is the point: $REMOTE_DIR and friends are local
# variables this script resolves before the command ever reaches the box.
# shellcheck disable=SC2029
remote() { ssh "${ssh_opts[@]}" "$TARGET" "$@"; }

say "box            $(remote 'hostname')"
say "uptime        $(remote 'uptime | sed "s/^ *//"')"

# ------------------------------------------------------------------- check
if [ "$CHECK_ONLY" -eq 1 ]; then
  step "Runner state on the box (nothing will be changed)"
  if remote "test -x $REMOTE_DIR/bootstrap/scripts/install-github-runner-host.sh"; then
    remote "cd $REMOTE_DIR && ./bootstrap/scripts/install-github-runner-host.sh --check" \
      | sed 's/^/    /'
  else
    say "no checkout at $REMOTE_DIR yet -- run without --check to install"
  fi
  exit 0
fi

# -------------------------------------------------------------------- copy
step "Copying the checkout to $REMOTE_DIR"

rsync_ssh="ssh"
[ -n "$SSH_KEY" ] && rsync_ssh="ssh -i $SSH_KEY -o IdentitiesOnly=yes"

rsync -a \
  --exclude .git --exclude node_modules --exclude 'dist' \
  -e "$rsync_ssh" \
  "$repo_root"/ "$TARGET:$REMOTE_DIR/"
say "copied"

# ----------------------------------------------------------------- install
step "Installing the runner service"
say "(creates the actions-runner user, fetches the pinned 2.328.0 release,"
say " installs the systemd unit -- idempotent, safe to re-run)"

remote "cd $REMOTE_DIR && CONFIRM=install-github-runner-host ./bootstrap/scripts/install-github-runner-host.sh" \
  | sed 's/^/    /'

# ------------------------------------------------------------- credentials
if [ "$WANT_TOKEN" -eq 1 ]; then
  step "Registration credential"

  if [ -z "${RUNNER_TOKEN:-}" ]; then
    say "Needs a fine-grained PAT scoped to this repository alone, with"
    say "Administration: Read and write -- the narrowest permission that can"
    say "mint a runner registration token."
    say "Create one at: https://github.com/settings/personal-access-tokens/new"
    say ""
    printf '    Paste the PAT (input hidden, empty to skip): '
    read -rs RUNNER_TOKEN
    printf '\n'
  fi

  if [ -n "${RUNNER_TOKEN:-}" ]; then
    # SC2087 is deliberate and load-bearing: the heredoc MUST expand here, on
    # this machine, so the PAT's value travels over ssh's stdin. Quoting 'EOF'
    # would send the literal string $RUNNER_TOKEN to a box where it is unset,
    # writing a credentials file containing nothing. SC2029 is the same choice
    # for $REMOTE_DIR on the line above.
    # shellcheck disable=SC2087,SC2029
    ssh "${ssh_opts[@]}" "$TARGET" \
      "cd $REMOTE_DIR && ./bootstrap/scripts/install-github-runner-host.sh --credentials" \
      <<EOF | sed 's/^/    /'
RUNNER_TOKEN=$RUNNER_TOKEN
EOF
    unset RUNNER_TOKEN
    say "written to /etc/actions-runner-host/credentials.env (mode 0600)"
  else
    say "skipped -- the service will hold and retry every 5 minutes until one"
    say "exists. Re-run this script later to supply it."
  fi
fi

# ------------------------------------------------------------------ verify
step "State on the box"
remote "cd $REMOTE_DIR && ./bootstrap/scripts/install-github-runner-host.sh --check" \
  | sed 's/^/    /' || true
remote "systemctl is-active github-runner.service || true" | sed 's/^/    service: /'

# -------------------------------------------------------------------- next
step "What is left, and only you can do it"
cat <<'NEXT'
    1. Confirm the runner registered:
         https://github.com/Duncan-Haywood/monorepo-projects/settings/actions/runners
       Expect one named hetzner-<hostname>, labels: self-hosted, linux, x64, hetzner

    2. Flip every workflow to it (all 226 already read the switch):
         Settings -> Secrets and variables -> Actions -> Variables
         New repository variable:  CI_RUNNER = self-hosted

       To roll back, delete that variable -- vars.CI_RUNNER goes empty, which
       is falsy, and everything falls back to ubuntu-latest.

    Two jobs stay on GitHub-hosted runners by design because they need Docker
    (world-clock-widget-ci.yml:test-core, quick-pick-survey-ci.yml:verify), so
    the Actions bill goes near zero, not exactly zero.

    Follow the logs on the box with:
      journalctl -u github-runner.service -f
NEXT

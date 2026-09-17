#!/usr/bin/env bash
# Install the Codex worker's host-mode systemd timer on a Hetzner box -- from
# your own machine, in one run.
#
# WHY THIS EXISTS
#
# `bootstrap/scripts/install-codex-host.sh` runs *on the box*, and
# `gitops/agents/host/README.md` documents it that way: rsync a checkout up,
# ssh in, run it. `bootstrap/scripts/setup-runner-from-laptop.sh` already does
# exactly this for the self-hosted GitHub Actions runner -- discovers the key
# that opens the box, copies the checkout, runs the installer, and hands over
# the credential -- because doing that by hand cost more than the install
# itself (which key, whether the host key has ever been seen, a leading `#`
# read as a command by a shell without `interactive_comments`). The Codex
# worker needed the same thing and did not have it: an owner wanting host-mode
# dev capacity running had to assemble the rsync, the ssh, and the credential
# hand-off from `gitops/agents/host/README.md`'s prose by hand.
#
# This is that script for the Codex worker instead of the runner. Same
# preflight, same key discovery, same "stops with a specific message the
# moment one step cannot be done" shape -- deliberately, so a laptop already
# used for the runner needs to learn nothing new to run this one.
#
# It holds no credential of its own. The SSH key stays on your machine; the
# Codex login JSON and the GitHub PAT are read from stdin or a prompt and
# shipped to the box over ssh's stdin, never in argv, so neither lands in
# shell history or `ps` on either end.
#
# ENABLING, AND WHY IT IS OPT-IN RATHER THAN ABSENT
#
# By default this does not enable the governor: `policy.json` ships
# "enabled": false, so the timer installs, ticks, and holds. Turning on
# unattended spend is an owner decision taken per box, and it stays one.
#
# `--enable` is how you take that decision here, in this run. Until 2026-09-17
# there was no way to, and the cost of that was specific rather than
# theoretical: the only route was `enable-codex-governor.sh --host-only`, then
# a commit and push, then *a second run of this script* to copy the changed
# policy up -- and the SSH that second run needs is `HETZNERSSHKEY`, the one
# owner action every route in this repository is blocked on. So the standalone
# route installed the worker, credentialed it against the ChatGPT plan's
# included quota, and then left it switched off behind the very key the owner
# had just spent their one session on.
#
# `install-codex-host.sh` had already fixed exactly this for itself
# (`--enable`, and `CODEX_ENABLED=1` on an install run), and
# `restore-cluster.sh` carries it through for the full-recovery route. This
# script was the one path that still asked for the second trip.
#
# It runs AFTER the credential hand-off, deliberately: the installer refuses to
# enable an uncredentialed governor -- one with nothing to authenticate against
# wakes every five minutes, fails, and sits on a six-hour auth cooldown, which
# from the outside is indistinguishable from a governor that is working. So
# `--enable` with `--no-creds`, or with no credential supplied at the prompt,
# is refused here with that reason rather than silently doing nothing.
#
# Neither this flag nor the installer touches the repository's committed
# `policy.json`. The default stays `false` so that no merge switches anyone on.
#
# WHAT IT DOES NOT DO
#
# It does not touch k3s, Argo, or anything serving the public site -- see
# `bootstrap/restore-cluster.sh WITH_CODEX_HOST=1` for installing this as part
# of a full cluster restore instead of standalone.
#
# USAGE
#
#   ./bootstrap/scripts/setup-codex-host-from-laptop.sh              # full run, holds
#   ./bootstrap/scripts/setup-codex-host-from-laptop.sh --check      # report only
#   ./bootstrap/scripts/setup-codex-host-from-laptop.sh --no-creds   # skip the credential hand-off
#   ./bootstrap/scripts/setup-codex-host-from-laptop.sh --enable     # and start spending the plan's quota
#
# Environment:
#   BOX_IP      box to install on (default 157.180.80.188, the 4 GB agent box
#               `infra/README.md` designates "Codex Jobs only"; 89.167.29.39
#               is the 24 GB k3s server and also serves the site)
#   SSH_KEY     skip key discovery and use this one
#   REMOTE_DIR  checkout path on the box (default /root/monorepo-projects)
set -euo pipefail

BOX_IP="${BOX_IP:-157.180.80.188}"
BOX_USER="${BOX_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/monorepo-projects}"
SSH_KEY="${SSH_KEY:-}"
TARGET="$BOX_USER@$BOX_IP"

CHECK_ONLY=0
WANT_CREDS=1
# `CODEX_ENABLED=1` in the environment is accepted as well as `--enable`, so a
# caller that already drives `install-codex-host.sh` or `restore-cluster.sh`
# from a script spells this the one way it spells it everywhere else.
WANT_ENABLE=0
[ "${CODEX_ENABLED:-0}" = "1" ] && WANT_ENABLE=1
for arg in "$@"; do
  case "$arg" in
    --check)    CHECK_ONLY=1 ;;
    --no-creds) WANT_CREDS=0 ;;
    --enable)   WANT_ENABLE=1 ;;
    -h|--help)  sed -n '2,72p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          printf 'setup-codex-host: unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

# Refuse the contradiction up front rather than at the end of a long install.
# `--enable --no-creds` asks for a governor that is switched on with nothing to
# authenticate against: it would wake every five minutes, fail, and sit on a
# six-hour auth cooldown, which looks from the outside exactly like a worker
# that is running.
if [ "$WANT_ENABLE" -eq 1 ] && [ "$WANT_CREDS" -eq 0 ]; then
  printf 'setup-codex-host: --enable needs credentials; --no-creds skips them.\n' >&2
  printf '  An enabled governor with no credential loops on a six-hour auth cooldown.\n' >&2
  exit 2
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
say()  { printf '    %s\n' "$*"; }
die()  { printf '\nsetup-codex-host: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
step "Checking this machine"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$repo_root/bootstrap/scripts/install-codex-host.sh" ] || die \
  "run this from a checkout of the monorepo (looked in $repo_root)"
[ -d "$repo_root/gitops/agents" ] || die \
  "gitops/agents is missing from $repo_root -- the installer needs it"

# Report EVERY missing tool at once, with the line that installs them, rather
# than dying on the first one. This runs during an outage, on whatever machine
# the owner has to hand, and it is the first gate of the one session the whole
# recovery gets -- so a preflight that surfaces one gap per run spends that
# session on round trips. It is the same defect `bootstrap/restore-cluster.sh`
# had until DRY_RUN was changed to print the half that needs no SSH first, and
# missing local tools are the clearest case for the same treatment: they are
# entirely knowable before any network call, so there is no reason at all to
# discover them one at a time.
missing=""
for tool in ssh rsync ssh-keygen ssh-keyscan; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  # `ssh`, `ssh-keygen` and `ssh-keyscan` all ship in one package, so name
  # packages rather than binaries -- an owner missing all three should be told
  # to install one thing, not three.
  pkgs=""
  case "$missing" in *" rsync"*) pkgs="rsync" ;; esac
  case "$missing" in
    *" ssh"*) pkgs="${pkgs:+$pkgs }openssh-client" ;;
  esac
  die "not on PATH:${missing}

    Debian/Ubuntu:  apt-get install -y ${pkgs}
    macOS:          brew install ${pkgs//openssh-client/openssh}"
fi
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
  say "stored value to check it against. To verify rather than trust it, open"
  say "the Hetzner Cloud Console for this server and run:"
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
  step "Codex host state on the box (nothing will be changed)"
  if remote "test -x $REMOTE_DIR/bootstrap/scripts/install-codex-host.sh"; then
    remote "cd $REMOTE_DIR && ./bootstrap/scripts/install-codex-host.sh --check" \
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
step "Installing the Codex host-mode timer"
say "(apt-gets node/npm/git/curl/tar if missing, installs governor.py,"
say " host_governor.py, worker.sh and the queue to /opt/codex-agents,"
say " installs the systemd units -- idempotent, safe to re-run)"

remote "cd $REMOTE_DIR && CONFIRM=install-codex-host ./bootstrap/scripts/install-codex-host.sh" \
  | sed 's/^/    /'

# ------------------------------------------------------------- credentials
# Whether a credential actually reached the box, as opposed to whether one was
# asked for. `--enable` reads this, and the two differ whenever the operator
# declined at the prompt.
creds_written=0
if [ "$WANT_CREDS" -eq 1 ]; then
  step "Worker credentials"

  codex_auth_json="${CODEX_AUTH_JSON:-}"
  gh_token="${GH_TOKEN:-}"

  if [ -z "$codex_auth_json" ]; then
    say "CODEX_AUTH_JSON is the file \`codex login\` leaves at ~/.codex/auth.json"
    say "on a machine where you have run it -- paste its contents as one line."
    printf '    Paste CODEX_AUTH_JSON (input hidden, empty to skip both): '
    read -rs codex_auth_json
    printf '\n'
  fi

  if [ -n "$codex_auth_json" ] && [ -z "$gh_token" ]; then
    say "GH_TOKEN needs a fine-grained PAT scoped to this repository alone,"
    say "with Contents: Read and write and Pull requests: Read and write --"
    say "the worker opens PRs and never merges."
    say "Create one at: https://github.com/settings/personal-access-tokens/new"
    printf '    Paste GH_TOKEN (input hidden): '
    read -rs gh_token
    printf '\n'
  fi

  if [ -n "$codex_auth_json" ] && [ -n "$gh_token" ]; then
    # SC2087 is deliberate and load-bearing: the heredoc MUST expand here, on
    # this machine, so both credentials travel over ssh's stdin. Quoting 'EOF'
    # would send the literal strings to a box where they are unset, writing a
    # credentials file containing nothing.
    # shellcheck disable=SC2087,SC2029
    ssh "${ssh_opts[@]}" "$TARGET" \
      "cd $REMOTE_DIR && ./bootstrap/scripts/install-codex-host.sh --credentials" \
      <<EOF | sed 's/^/    /'
CODEX_AUTH_JSON=$codex_auth_json
GH_TOKEN=$gh_token
EOF
    unset codex_auth_json gh_token
    creds_written=1
    say "written to /etc/codex-agents/credentials.env (mode 0600)"
  else
    say "skipped -- the timer will tick and hold on the auth cooldown until"
    say "credentials exist. Re-run this script later to supply them, or run"
    say "  ssh root@$BOX_IP 'cd $REMOTE_DIR && ./bootstrap/scripts/install-codex-host.sh --credentials' < codex.env"
  fi
fi

# --------------------------------------------------------------- enable
# After the credential hand-off, never before: the installer refuses to enable
# an uncredentialed governor, and doing it in the wrong order would turn this
# flag into a no-op that still printed success.
if [ "$WANT_ENABLE" -eq 1 ]; then
  step "Enabling the governor"
  if [ "$creds_written" -eq 1 ]; then
    remote "cd $REMOTE_DIR && ./bootstrap/scripts/install-codex-host.sh --enable" \
      | sed 's/^/    /'
    say "the timer will start a worker on its next tick, against the plan's"
    say "included quota. Turn it back off at any time with:"
    say "  ssh root@$BOX_IP 'cd $REMOTE_DIR && ./bootstrap/scripts/install-codex-host.sh --disable'"
  else
    # Asked for, and genuinely not done. Saying so is the whole point: the
    # failure this flag exists to prevent is a worker that looks enabled.
    say "NOT enabled -- no credential reached the box, so an enabled governor"
    say "would only loop on the six-hour auth cooldown. Supply credentials and"
    say "re-run with --enable, or once they are in place:"
    say "  ssh root@$BOX_IP 'cd $REMOTE_DIR && ./bootstrap/scripts/install-codex-host.sh --enable'"
  fi
fi

# ------------------------------------------------------------------ verify
step "State on the box"
remote "cd $REMOTE_DIR && ./bootstrap/scripts/install-codex-host.sh --check" \
  | sed 's/^/    /' || true

# -------------------------------------------------------------------- next
step "What is left, and only you can do it"
if [ "$WANT_ENABLE" -eq 1 ] && [ "$creds_written" -eq 1 ]; then
cat <<NEXT
    1. Nothing, for the box itself -- the governor is enabled and credentialed.

    2. Watch it:
         ssh root@$BOX_IP 'systemctl list-timers codex-governor.timer'
         ssh root@$BOX_IP 'journalctl -u codex-governor.service -f'

    Once the cluster and a real seal are back, run
    enable-codex-governor.sh with no flags instead to also turn on the k3s
    CronJob path -- see gitops/agents/host/README.md for how the two relate.
NEXT
else
cat <<NEXT
    1. The governor is still disabled ("enabled": false in policy.json) so
       nothing spends quota yet. The one-run way is to re-run this script
       with --enable, which needs no commit and no second key:
         ./bootstrap/scripts/setup-codex-host-from-laptop.sh --enable

       The repository-wide switch, if you want the committed default moved
       instead -- no k3s, no SealedSecret needed:
         ./bootstrap/scripts/enable-codex-governor.sh --host-only

    2. If you took the second route, commit and push the resulting
       gitops/agents/governor/policy.json change, then re-run this script
       (or install-codex-host.sh on the box) to copy the updated policy
       over -- the systemd timer reads the copy under /opt/codex-agents,
       not the repo on your laptop.

    3. Watch it:
         ssh root@$BOX_IP 'systemctl list-timers codex-governor.timer'
         ssh root@$BOX_IP 'journalctl -u codex-governor.service -f'

    Once the cluster and a real seal are back, run
    enable-codex-governor.sh with no flags instead to also turn on the k3s
    CronJob path -- see gitops/agents/host/README.md for how the two relate.
NEXT
fi

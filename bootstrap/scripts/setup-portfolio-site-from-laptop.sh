#!/usr/bin/env bash
# Serve the portfolio catalogue from a Hetzner box's own nginx -- from your
# own machine, in one run.
#
# WHY THIS EXISTS
#
# Three things can run on these boxes without k3s, Argo, or an Actions runner,
# and each has an installer that runs *on the box*:
#
#   what it does          on-box installer                      laptop driver
#   -------------------   -----------------------------------   -------------
#   dev capacity (Codex)  install-codex-host.sh                  yes
#   CI (Actions runner)   install-github-runner-host.sh          yes
#   SERVES THE SITE       install-portfolio-site-host.sh         was missing
#
# Two of the three had a one-command driver -- discover the key that opens the
# box, copy the checkout, run the installer, hand over the credential -- and
# the third did not. So the one route whose completion a *visitor* can see was
# also the only one an owner had to assemble by hand from prose, or take as a
# side effect of `restore-cluster.sh WITH_PORTFOLIO_SITE_HOST=1`: a full k3s
# rebuild whose own decision-queue row calls the addressing steps "its least-
# proven part". Serving marisstella.dev needs none of that. This is the
# missing row.
#
# Deliberately the same shape as `setup-codex-host-from-laptop.sh`: same
# preflight, same host-key prompt, same key discovery, same "stop with a
# specific message the moment a step cannot be done". A laptop already used
# for the Codex worker or the runner learns nothing new here.
#
# ONE THING IT DOES DIFFERENTLY, AND IT MATTERS
#
# The Codex and runner installers only need a checkout. This one *clones the
# repository on the box*, because the site host self-updates: a systemd timer
# fetches `main` every ten minutes and rebuilds if it moved. That clone needs
# `GH_TOKEN` (this origin is private), and `install-portfolio-site-host.sh`
# falls back to cloning the rsync'd tree only if that tree still has its
# `.git`. So the ordering is not cosmetic:
#
#   * credentials are collected and written BEFORE the install, not after --
#     a token that arrives afterwards leaves the box holding a clone it could
#     not make;
#   * with no token, the rsync carries `.git` so the fallback has something to
#     clone from. Copying the codex driver verbatim (which excludes `.git`)
#     would strand a fresh box with "cannot clone and $ROOT is not a git
#     checkout" -- the installer's own error names that exact cause.
#
# It holds no credential of its own. The SSH key stays on your machine; the
# PAT is read from stdin or a hidden prompt and shipped over ssh's stdin,
# never in argv, so it lands in neither shell history nor `ps` on either end.
#
# WHAT IT DOES NOT DO
#
# It does not install, touch, or require k3s, Argo CD, or an Actions runner,
# creates no Hetzner resources, and never calls the Hetzner API. It obtains no
# certificate unless you pass `--tls`. It does not touch the `gh-pages` route
# that already serves the catalogue at the github.io URL -- the two are
# independent, and this one is about `marisstella.dev` itself.
#
# USAGE
#
#   ./bootstrap/scripts/setup-portfolio-site-from-laptop.sh            # full run
#   ./bootstrap/scripts/setup-portfolio-site-from-laptop.sh --check    # report only
#   ./bootstrap/scripts/setup-portfolio-site-from-laptop.sh --no-creds # skip the PAT
#   SITE_TLS_EMAIL=you@example.com \
#     ./bootstrap/scripts/setup-portfolio-site-from-laptop.sh --tls    # and get a cert
#
# Environment:
#   BOX_IP          box to install on (default 89.167.29.39, the 24 GB server
#                   `marisstella.dev` already resolves to; 157.180.80.188 is
#                   the 4 GB agent box and is not what DNS points at)
#   SSH_KEY         skip key discovery and use this one
#   REMOTE_DIR      checkout path on the box (default /root/monorepo-projects)
#   SITE_TLS_EMAIL  address Let's Encrypt sends expiry warnings to (--tls)
#   GH_TOKEN        supply the PAT non-interactively instead of being prompted
set -euo pipefail

BOX_IP="${BOX_IP:-89.167.29.39}"
BOX_USER="${BOX_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/monorepo-projects}"
SSH_KEY="${SSH_KEY:-}"
TARGET="$BOX_USER@$BOX_IP"
SITE_DOMAINS="${SITE_DOMAINS:-marisstella.dev www.marisstella.dev}"
PRIMARY_DOMAIN="${SITE_DOMAINS%% *}"

CHECK_ONLY=0
WANT_CREDS=1
WANT_TLS=0
for arg in "$@"; do
  case "$arg" in
    --check)    CHECK_ONLY=1 ;;
    --no-creds) WANT_CREDS=0 ;;
    --tls)      WANT_TLS=1 ;;
    -h|--help)  sed -n '2,74p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          printf 'setup-portfolio-site: unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
say()  { printf '    %s\n' "$*"; }
die()  { printf '\nsetup-portfolio-site: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
step "Checking this machine"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$repo_root/bootstrap/scripts/install-portfolio-site-host.sh" ] || die \
  "run this from a checkout of the monorepo (looked in $repo_root)"
[ -d "$repo_root/gitops/prod/host" ] || die \
  "gitops/prod/host is missing from $repo_root -- the installer needs its nginx conf and units"

for tool in ssh rsync ssh-keygen ssh-keyscan; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH"
done
say "checkout    $repo_root"
say "target      $TARGET"

if [ "$WANT_TLS" -eq 1 ] && [ -z "${SITE_TLS_EMAIL:-}" ]; then
  die "--tls needs SITE_TLS_EMAIL -- it is the only way you learn a renewal
has been failing before the certificate lapses. Re-run as:

  SITE_TLS_EMAIL=you@example.com $0 --tls"
fi

# ------------------------------------------------------------------ dns
# Advisory, never fatal. The install is correct either way; what DNS decides
# is whether a visitor reaches it, and whether `--tls` can pass the ACME
# HTTP-01 challenge (certbot answers on the name, not on the IP). Saying this
# before the install costs nothing and saves a failed certificate request.
step "Where $PRIMARY_DOMAIN points"

resolved=""
if command -v dig >/dev/null 2>&1; then
  resolved="$(dig +short A "$PRIMARY_DOMAIN" 2>/dev/null | tail -1)"
elif command -v host >/dev/null 2>&1; then
  resolved="$(host -t A "$PRIMARY_DOMAIN" 2>/dev/null | awk '/has address/ {print $NF; exit}')"
elif command -v getent >/dev/null 2>&1; then
  resolved="$(getent ahostsv4 "$PRIMARY_DOMAIN" 2>/dev/null | awk '{print $1; exit}')"
fi

if [ -z "$resolved" ]; then
  say "could not resolve it from here -- skipping this check, nothing is wrong yet"
elif [ "$resolved" = "$BOX_IP" ]; then
  say "$PRIMARY_DOMAIN -> $resolved  (this box)"
else
  say "$PRIMARY_DOMAIN -> $resolved, but you are installing on $BOX_IP."
  say ""
  say "The install below will still be correct, and the box will serve the"
  say "catalogue on its own IP. What will not work until DNS agrees:"
  say "  - a visitor typing $PRIMARY_DOMAIN reaches $resolved, not this box"
  say "  - --tls cannot pass the ACME challenge, so certbot will fail"
  say ""
  say "Either point the A record at $BOX_IP, or re-run with BOX_IP=$resolved."
fi

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
  step "Site host state on the box (nothing will be changed)"
  if remote "test -x $REMOTE_DIR/bootstrap/scripts/install-portfolio-site-host.sh"; then
    remote "cd $REMOTE_DIR && ./bootstrap/scripts/install-portfolio-site-host.sh --check" \
      | sed 's/^/    /'
  else
    say "no checkout at $REMOTE_DIR yet -- run without --check to install"
  fi
  exit 0
fi

# ------------------------------------------------------------- credentials
# Before the install, not after: `install-portfolio-site-host.sh` clones the
# repository during the install and reads GH_TOKEN from the credentials file
# it finds already written. A PAT handed over afterwards is a PAT the clone
# never saw.
gh_token="${GH_TOKEN:-}"
if [ "$WANT_CREDS" -eq 1 ] && [ -z "$gh_token" ]; then
  step "Repository credential"
  say "The box re-clones and rebuilds from main every 10 minutes, so it needs"
  say "read access to this private repository. A fine-grained PAT scoped to"
  say "this repository alone, with Contents: Read -- nothing else."
  say "Create one at: https://github.com/settings/personal-access-tokens/new"
  say ""
  say "Empty is allowed: the box will serve the tree copied below and simply"
  say "will not self-update until you supply one."
  printf '    Paste GH_TOKEN (input hidden, empty to skip): '
  read -rs gh_token
  printf '\n'
fi

# -------------------------------------------------------------------- copy
step "Copying the checkout to $REMOTE_DIR"

rsync_ssh="ssh"
[ -n "$SSH_KEY" ] && rsync_ssh="ssh -i $SSH_KEY -o IdentitiesOnly=yes"

# With a token the box clones from the origin and the local `.git` is dead
# weight (this repository's history is large). Without one, that `.git` is the
# installer's ONLY fallback -- it clones the rsync'd tree instead -- so it has
# to travel. Getting this backwards is the "cannot clone ... was .git excluded
# from the rsync?" failure the installer warns about.
rsync_excludes=(--exclude node_modules --exclude 'dist')
if [ -n "$gh_token" ]; then
  rsync_excludes+=(--exclude .git)
  say "excluding .git -- the box will clone from the origin with your PAT"
else
  say "including .git -- with no PAT it is the only thing the box can clone from"
fi

rsync -a "${rsync_excludes[@]}" -e "$rsync_ssh" "$repo_root"/ "$TARGET:$REMOTE_DIR/"
say "copied"

if [ -n "$gh_token" ]; then
  step "Writing the credential to the box"
  # SC2087 is deliberate and load-bearing: the heredoc MUST expand here, on
  # this machine, so the token travels over ssh's stdin. Quoting 'EOF' would
  # send the literal string to a box where it is unset, writing a credentials
  # file containing nothing.
  # shellcheck disable=SC2087,SC2029
  ssh "${ssh_opts[@]}" "$TARGET" \
    "cd $REMOTE_DIR && ./bootstrap/scripts/install-portfolio-site-host.sh --credentials" \
    <<EOF | sed 's/^/    /'
GH_TOKEN=$gh_token
EOF
  unset gh_token
  say "written (mode 0600) -- it is now on the box and not in this shell"
fi

# ----------------------------------------------------------------- install
step "Installing nginx, the refresh timer, and the first build"
say "(renders the nginx site, builds the catalogue with platform/pages/build.mjs,"
say " validates it with check.mjs, swaps it in, enables a 10-minute refresh"
say " timer -- idempotent, safe to re-run)"

remote "cd $REMOTE_DIR && CONFIRM=install-portfolio-site-host ./bootstrap/scripts/install-portfolio-site-host.sh" \
  | sed 's/^/    /'

# --------------------------------------------------------------------- tls
if [ "$WANT_TLS" -eq 1 ]; then
  step "Certificate for $SITE_DOMAINS"
  say "(certbot --webroot; needs DNS for each name to point at $BOX_IP already)"
  # shellcheck disable=SC2029
  remote "cd $REMOTE_DIR && SITE_TLS_EMAIL='${SITE_TLS_EMAIL}' CONFIRM=install-portfolio-site-host ./bootstrap/scripts/install-portfolio-site-host.sh --tls" \
    | sed 's/^/    /'
fi

# ------------------------------------------------------------------ verify
# Through nginx on the box, not by reading a manifest. This repository has
# repeatedly recorded a correct reading of a *config* restated as a claim
# about what a visitor receives; a status code from the server settles it.
step "Asking the box what it serves"

health="$(remote "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/healthz" 2>/dev/null || echo 000)"
home="$(remote "curl -sS -o /dev/null -w '%{http_code}' -H 'Host: $PRIMARY_DOMAIN' http://127.0.0.1/" 2>/dev/null || echo 000)"
say "/healthz                       $health"
say "/ (Host: $PRIMARY_DOMAIN)      $home"
if [ "$health" = "200" ] && [ "$home" = "200" ]; then
  say ""
  say "nginx is serving the catalogue on this box."
else
  say ""
  say "not serving yet -- see the installer output above and:"
  say "      ssh $TARGET 'journalctl -u portfolio-site-refresh.service -n 50'"
fi

step "State on the box"
remote "cd $REMOTE_DIR && ./bootstrap/scripts/install-portfolio-site-host.sh --check" \
  | sed 's/^/    /' || true

# -------------------------------------------------------------------- next
step "What is left"
cat <<NEXT
    1. Confirm from OUTSIDE this box -- the check above asked nginx over
       loopback, which proves it is serving but not that anyone can reach it:
         curl -sS -o /dev/null -w '%{http_code}\\n' https://$PRIMARY_DOMAIN/
       A refused connection there with a 200 above means the firewall or DNS,
       not the install.

    2. If you skipped --tls, get a certificate. $PRIMARY_DOMAIN is under an
       HSTS-preloaded TLD, so until this a browser will NOT load the site
       however healthy curl says it is:
         SITE_TLS_EMAIL=you@example.com $0 --tls

    3. Watch it keep itself current (it rebuilds from main every 10 minutes):
         ssh $TARGET 'systemctl list-timers portfolio-site-refresh.timer'
         ssh $TARGET 'journalctl -u portfolio-site-refresh.service -f'

    This route is independent of the gh-pages one. The catalogue stays served
    at https://duncan-haywood.github.io/monorepo-projects/ either way; what
    this adds is the portfolio's own name.
NEXT

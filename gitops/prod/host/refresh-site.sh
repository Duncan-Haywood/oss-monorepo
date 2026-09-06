#!/usr/bin/env bash
# Rebuild the portfolio site from `main` and swap it in, on the box itself.
#
# WHY THIS EXISTS
#
# Every other way this repository has of getting the site in front of a
# stranger publishes a *snapshot* and then goes quiet:
#
#   - `platform/pages/publish-branch.sh` commits a built tree to `gh-pages`.
#     Its own header calls the cost out: "a committed artifact is a snapshot,
#     so it goes stale the moment `main` moves and nothing refreshes it."
#   - CLAUDE.md records that snapshot being found stale on 2026-09-06, one
#     merge behind, by a session that had read the section telling it to
#     refresh by hand.
#   - `.github/workflows/publish-pages-branch.yml` automates that refresh, and
#     needs an Actions runner -- so during a starvation window it does nothing,
#     which is precisely when it is needed.
#
# The in-cluster path never had this problem, because Argo CD *pulls*: a merge
# to `main` is the deploy, with nothing to remember. This is that property,
# rebuilt for a box with no cluster on it. A timer ticks, the checkout fetches
# `main`, and if `main` has moved the site is rebuilt and swapped in. Nothing
# pushes to this box and this box pushes nothing.
#
# WHAT MAKES IT SAFE TO RUN UNATTENDED
#
#   1. It is fail-closed at the only point that matters. A release is built
#      into a fresh directory and only becomes live if `check.mjs` passes on
#      it. A build that produces dead links, a missing page, or a broken
#      canonical leaves the previous release serving and exits non-zero. The
#      site cannot be replaced by a worse copy of itself, which is the whole
#      risk of automating a deploy nobody is watching.
#   2. The swap is a symlink rename, so it is atomic. No request ever sees a
#      half-copied tree, and rollback is re-pointing the symlink at the
#      previous release directory, which is still on disk.
#   3. It is a no-op when `main` has not moved and the live release was built
#      from that commit, so the timer is cheap and the logs stay readable.
#   4. It pushes nothing, calls no paid API, and needs no credential beyond
#      read access to this repository.
#
# Environment (all optional; the systemd unit sets the ones that matter):
#   SITE_REPO_DIR    deploy checkout            (default /opt/portfolio-site/repo)
#   SITE_STATE_DIR   releases + current symlink (default /var/lib/portfolio-site)
#   SITE_BASE_URL    passed to build.mjs as PAGES_BASE_URL
#   SITE_KEEP        old releases to retain     (default 3)
#   GH_TOKEN         read access, for a private origin. Absent is a clean hold,
#                    not an error -- see the note where it is used.
set -euo pipefail

REPO_DIR="${SITE_REPO_DIR:-/opt/portfolio-site/repo}"
STATE_DIR="${SITE_STATE_DIR:-/var/lib/portfolio-site}"
RELEASES="$STATE_DIR/releases"
CURRENT="$STATE_DIR/current"
KEEP="${SITE_KEEP:-3}"
BRANCH="${SITE_BRANCH:-main}"

log()  { printf '[refresh-site] %s\n' "$*"; }
die()  { printf '[refresh-site] %s\n' "$*" >&2; exit 1; }

# nginx's workers run as an unprivileged user (`www-data` on Debian/Ubuntu) and
# must be able to traverse and read every release this script writes. The
# release tree inherits whatever umask this process was started with, and a
# systemd unit can carry a restrictive `UMask=` from a drop-in or a hardened
# distro default -- in which case the build succeeds, the swap succeeds, the
# logs are clean, and every request 404s with `stat() ... failed (13:
# Permission denied)` in the error log. Pinning it here makes the readable
# outcome a property of this script rather than of the environment it inherits.
umask 022

[[ -d "$REPO_DIR/.git" ]] || die "no checkout at $REPO_DIR -- run install-portfolio-site-host.sh first."
command -v node >/dev/null 2>&1 || die "node is not on PATH."

# A private origin needs a credential to fetch. Not having one yet is the same
# "hold" state gitops/ci/host/register-and-run.sh sits in: log why and exit 0,
# so the timer retries later instead of the unit entering a failed state and
# the box looking broken when it is merely uncredentialed.
# Never let git open an interactive prompt. This runs from a systemd oneshot
# with no terminal, so a fetch that needs a credential the box does not have
# must fail immediately and be handled below -- not block until
# TimeoutStartSec while the site quietly stops tracking `main`.
export GIT_TERMINAL_PROMPT=0
if [[ -n "${GH_TOKEN:-}" ]]; then
  # The helper reads the token from the environment when git runs it, so the
  # secret never lands in a file on disk and never appears in argv.
  askpass="$(mktemp)"
  chmod 0700 "$askpass"
  # shellcheck disable=SC2016  # $GH_TOKEN must stay unexpanded until git runs this.
  printf '#!/bin/sh\nprintf "%%s" "$GH_TOKEN"\n' > "$askpass"
  trap 'rm -f "$askpass"' EXIT
  export GIT_ASKPASS="$askpass"
fi

log "fetching $BRANCH"
if git -C "$REPO_DIR" fetch --quiet origin "$BRANCH" 2>/dev/null; then
  target="$(git -C "$REPO_DIR" rev-parse FETCH_HEAD)"
  fetched=1
else
  fetched=0
  # A fetch that fails is not automatically a reason to do nothing, and which
  # it is depends entirely on whether anything is being served yet.
  #
  # If a release is already live, holding is right: the box is serving correct
  # content and merely cannot see whether `main` has moved. That is the same
  # "hold" state gitops/ci/host/register-and-run.sh sits in, and it exits 0 so
  # the timer retries rather than the unit going red on a box that is fine.
  #
  # If nothing is live, holding is the failure this repository has already paid
  # for once: an install that "succeeds" onto a box which then serves nothing.
  # The checkout on disk is a perfectly good tree to build -- it is what the
  # operator put here -- so build it, say plainly that it came from the local
  # checkout rather than from origin, and let the next successful fetch move
  # the box onto `main`.
  if [[ -L "$CURRENT" ]]; then
    log "cannot fetch origin/$BRANCH and a release is already live -- holding."
    if [[ -z "${GH_TOKEN:-}" ]]; then
      log "this box has no GH_TOKEN; write one with: install-portfolio-site-host.sh --credentials"
    else
      log "a credential is present, so check GH_TOKEN's read access on the origin."
    fi
    exit 0
  fi
  target="$(git -C "$REPO_DIR" rev-parse HEAD)"
  log "cannot fetch origin/$BRANCH and nothing is being served yet."
  log "building from the local checkout at $target so this box serves something."
  log "it will move onto origin/$BRANCH as soon as a fetch succeeds."
fi
live_stamp="$CURRENT/.built-from"
if [[ -L "$CURRENT" && -f "$live_stamp" ]] && [[ "$(cat "$live_stamp")" == "$target" ]]; then
  log "already serving $target -- nothing to do."
  exit 0
fi

log "building $target"
# Only ever move the checkout onto something actually fetched from origin.
# `reset --hard` is safe *because this checkout is deploy-only*: the installer
# creates it, nothing edits it by hand, and the unit runs it read-only from
# git's point of view. It is not a working tree anyone has changes in. In the
# no-fetch case above the target already *is* HEAD, so resetting would be a
# no-op -- skipping it keeps that true even if this file grows another branch
# later, when a stray `reset --hard` would be destroying an operator's tree.
if [[ "$fetched" == "1" ]]; then
  git -C "$REPO_DIR" reset --quiet --hard "$target"
fi

# The commit is part of the directory name, not only of `.built-from`, because
# the timestamp alone is second-resolution: two refreshes in the same second
# would land on the same path, and `mv` of a directory onto an existing
# directory moves it *inside* rather than replacing it -- leaving a release
# nested in its predecessor and the symlink pointing at the older content. The
# timer's ten-minute interval makes that unlikely rather than impossible, and
# an operator running the script by hand after a merge can easily hit it.
stamp="$(date -u +%Y%m%dT%H%M%SZ)-${target:0:8}"
staging="$RELEASES/.staging-$stamp"
release="$RELEASES/$stamp"
mkdir -p "$RELEASES"
rm -rf "$staging"

# The build and the check both run against the staging directory, so a failure
# below leaves `current` pointing exactly where it did.
if [[ -n "${SITE_BASE_URL:-}" ]]; then
  export PAGES_BASE_URL="$SITE_BASE_URL"
fi
if ! node "$REPO_DIR/platform/pages/build.mjs" --out="$staging" >/dev/null; then
  rm -rf "$staging"
  die "build.mjs failed; the live release is untouched."
fi

# The fail-closed point. check.mjs is what stands between an automated rebuild
# and silently replacing a working catalogue with a broken one -- it is the
# same check platform/pages/publish-branch.sh runs before it will publish, and
# CLAUDE.md records dead links and missing pages reaching `main` more than once
# when an equivalent check was skipped.
if ! node "$REPO_DIR/platform/pages/check.mjs" "$staging"; then
  rm -rf "$staging"
  die "check.mjs rejected the build; the live release is untouched and still served."
fi

printf '%s\n' "$target" > "$staging/.built-from"
mv "$staging" "$release"

# Atomic swap: create the new link under a temporary name and rename it over
# the old one. `ln -sfn` on an existing symlink-to-a-directory would put the
# link *inside* the target directory rather than replacing it, which is the
# classic way this idiom breaks.
ln -s "$release" "$CURRENT.new"
mv -T "$CURRENT.new" "$CURRENT"
log "serving $release (built from $target)"

# Keep a few predecessors so a rollback is a symlink away.
mapfile -t old < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -name '2*' -printf '%f\n' | sort -r | tail -n "+$((KEEP + 1))")
for dir in "${old[@]:-}"; do
  [[ -n "$dir" ]] || continue
  rm -rf "${RELEASES:?}/$dir"
  log "pruned old release $dir"
done

# nginx resolves `root` per request, and no open_file_cache is configured, so
# the swap is picked up with no reload. Deliberate: a reload would be one more
# thing that can fail after the site is already correct on disk.
log "done."

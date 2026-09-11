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
#   SITE_INDEXNOW    set to 0 to skip the IndexNow announcement after a swap.
#                    Never fails the refresh either way -- see announce_to_indexnow.
#   SITE_INDEXNOW_TIMEOUT  seconds to allow that announcement (default 120).
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
#
# Ordered by mtime, not by name. The name is `<timestamp>-<sha8>` and the
# timestamp is second-resolution, so two releases minted in the same second are
# separated only by the commit sha -- which is not chronological. A lexical sort
# then puts them in an arbitrary order, and the tail of that order gets deleted:
# with SITE_KEEP=2 and three same-second releases, the one `current` points at
# is deleted roughly a third of the time, leaving the symlink dangling and nginx
# serving 404 for every path on the site. The comment above already noted that
# second-resolution collisions are "unlikely rather than impossible" and gave
# the *path* a sha to stay unique; the ordering here was still assuming the name
# sorts chronologically.
#
# The live release is then excluded outright rather than trusted to sort high.
# mtime ordering makes a collision improbable instead of impossible (the same
# second is the same second), and "never delete what is being served" is the
# invariant that actually matters -- it should not rest on a sort.
live=""
if [[ -L "$CURRENT" ]]; then
  live="$(basename "$(readlink -f "$CURRENT")")"
fi

# Newest first by mtime.
mapfile -t ranked < <(
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -name '2*' -printf '%T@\t%f\n' \
    | sort -rn | cut -f2-
)

# The live release is pinned to the head rather than dropped from the list, so
# SITE_KEEP still means "this many releases on disk" and not "this many plus
# whatever is being served".
ranked_live_first=()
[[ -n "$live" ]] && ranked_live_first+=("$live")
for dir in "${ranked[@]:-}"; do
  [[ -n "$dir" && "$dir" != "$live" ]] || continue
  ranked_live_first+=("$dir")
done

# Never fewer than one: SITE_KEEP=0 would otherwise delete the release the
# symlink points at, which is the failure this whole block exists to avoid.
keep_n="$KEEP"
[[ "$keep_n" -lt 1 ]] && keep_n=1
for ((i = keep_n; i < ${#ranked_live_first[@]}; i++)); do
  rm -rf "${RELEASES:?}/${ranked_live_first[i]}"
  log "pruned old release ${ranked_live_first[i]}"
done

# nginx resolves `root` per request, and no open_file_cache is configured, so
# the swap is picked up with no reload. Deliberate: a reload would be one more
# thing that can fail after the site is already correct on disk.

# ------------------------------------------------------------------ announce
#
# Tell IndexNow-participating engines (Bing, Yandex, Seznam, Naver — not
# Google) that this release exists.
#
# Ordered after the prune, not before it, because the prune is local and
# certain while this makes a network call. Node's `fetch` has no default
# timeout, so an endpoint that blackholes would otherwise hold the unit open
# until `TimeoutStartSec` with the old releases still on disk.
#
# WHY THIS ROUTE AND NOT ONLY `publish-branch.sh`
#
# `platform/pages/publish-branch.sh` already announces, and until now it was
# the only caller. But look at where each one *stands*:
#
#   - `publish-branch.sh` is run from an agent session, whose sandbox answers
#     `403 to CONNECT` for `api.indexnow.org`. Its own header says so. Every
#     announcement from there takes the EXIT_NO_EGRESS branch and submits
#     nothing.
#   - `.github/workflows/publish-pages-branch.yml` would have real egress, and
#     needs an Actions runner. Those are metered and have been starved for most
#     of the last fortnight.
#
# This box has ordinary networking and no runner in the path, so it is the one
# publisher in this repository that can actually reach the API. That matters
# more than "keep the two routes in step": `platform/ci/pages_state.py`'s
# `indexing` row measured that `robots.txt` — and the `Sitemap:` line naming
# every published page — is unreachable to a crawler on a project-Pages
# subpath, so sitemap auto-discovery has never once happened for this
# catalogue. IndexNow is the one enumeration route that survives that, because
# it names its key's location in the request instead of assuming the host root.
# Leaving it out here left the catalogue with an enumeration route it could
# never execute.
#
# WHY IT NEVER FAILS THE REFRESH
#
# By the time this runs the swap has already happened and the new release is
# being served. Failing here would report a *successful deploy* as a failure,
# put the systemd unit in a failed state, and make a box that is serving
# correct content look broken — the same reasoning `publish-branch.sh` gives
# for returning 0 from its own announcement. What it must not do is report
# nothing: the outcome is logged either way, which is the whole point of
# making this an executed step rather than a line of prose somebody remembers.
#
# `SITE_INDEXNOW=0` skips it, for a rebuild you deliberately do not want
# announced (a rollback, or a release you are about to replace).
announce_to_indexnow() {
  if [[ "${SITE_INDEXNOW:-1}" == '0' ]]; then
    log "IndexNow: skipped (SITE_INDEXNOW=0)"
    return 0
  fi

  local script="$REPO_DIR/platform/marketing/indexnow.mjs"
  if [[ ! -f "$script" ]]; then
    # An older checkout predating the script. Not an error, and not silent.
    log "IndexNow: skipped -- no platform/marketing/indexnow.mjs in this checkout."
    return 0
  fi

  # `--dir` submits what this box actually built and is now serving, rather
  # than what some other publisher's branch contains. `--base-url` is passed
  # whenever the operator set one, because this deploy checkout tracks `main`
  # and never fetches `gh-pages`: without it the script would fall back to
  # reading the artifact's own catalog.json, which is correct here but is a
  # weaker statement than the box saying which origin it serves.
  local args=(--dir "$release" --submit)
  if [[ -n "${SITE_BASE_URL:-}" ]]; then
    args+=(--base-url "$SITE_BASE_URL")
  fi

  # Bound it, because "never fails the refresh" does not survive a *hang*.
  #
  # The case below returns 0 for every exit code this can produce, which
  # covers an announcement that fails. It does not cover one that never
  # finishes: Node's `fetch` has no default timeout, so an endpoint that
  # accepts the connection and then goes quiet holds this open until the
  # unit's own `TimeoutStartSec=600` kills the whole script -- and systemd
  # marks the unit FAILED, which is precisely the "a box serving correct
  # content looks broken" outcome the property above exists to prevent. The
  # site is already live by then, so the failure is cosmetic and the next tick
  # recovers, but a red unit is the signal an operator acts on and it would be
  # lying.
  #
  # `timeout` costs one skipped announcement instead, well inside the unit's
  # budget. It is coreutils and present on any Debian/Ubuntu box; the fallback
  # is there so a host without it still announces rather than skipping.
  local runner=(node "$script")
  local limit="${SITE_INDEXNOW_TIMEOUT:-120}"
  if command -v timeout >/dev/null 2>&1; then
    runner=(timeout "$limit" node "$script")
  fi

  local status=0
  "${runner[@]}" "${args[@]}" || status=$?
  case "$status" in
    0) log "IndexNow: submitted." ;;
    # EXIT_NO_EGRESS. Expected on a box behind a proxy, and not a deploy
    # failure: nothing was sent and nothing was broken.
    3) log "IndexNow: not submitted -- this host has no egress to api.indexnow.org." ;;
    # GNU timeout's own code for "I killed it".
    124) log "IndexNow: not submitted -- timed out after ${limit}s. The site is live and unaffected." ;;
    *) log "IndexNow: submission rejected (exit $status). The site is live and unaffected; see the output above." ;;
  esac
  return 0
}

announce_to_indexnow

log "done."

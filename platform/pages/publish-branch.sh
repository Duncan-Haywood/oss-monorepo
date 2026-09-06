#!/usr/bin/env bash
# Publish the built Pages site to an orphan `gh-pages` branch.
#
# Why this exists
# ---------------
# `.github/workflows/portfolio-pages.yml` publishes the same artifact through
# `actions/deploy-pages`, which is the "GitHub Actions" Pages source. That is
# the better route when it works: it rebuilds on every merge to `main`, so the
# published site cannot drift from the repository.
#
# It needs a runner, though, and this account's Actions minutes are metered.
# When the allowance is spent every job returns `runner_id: 0` (see
# `platform/ci/ci_starvation.py`) and that route publishes nothing. On
# 2026-09-04 that happened at the same time as the k3s cluster went down, and
# because the self-hosted runners in `gitops/ci/` are pods *in* that cluster,
# all three ways of serving the catalogue were down at once.
#
# This script is the fourth way, and the only one that is downstream of
# neither a runner nor the cluster: build the site here, commit it to a
# branch, and let GitHub serve that branch statically. The owner's action
# becomes Settings -> Pages -> Source "Deploy from a branch" -> `gh-pages` /
# root, with no `PAGES_ENABLED` variable and no workflow run involved.
#
# The tradeoff, stated plainly: a committed artifact is a snapshot, so it goes
# stale the moment `main` moves and nothing refreshes it automatically. That
# cost is low for this particular catalogue — every product here is a static
# client-side calculator, so a month-old copy computes exactly what today's
# does — but it is a real cost, and the honest fix is to go back to the
# workflow route once runners are reliable. Re-run this script to refresh.
#
# The custom domain it must not eat
# ---------------------------------
# Every run force-pushes an orphan commit built from `dist/`, so whatever is on
# the branch that this build did not produce is *deleted*. That is the right
# behaviour for a generated artifact and it is wrong for exactly one file.
#
# When the owner sets Settings -> Pages -> Custom domain, GitHub does not store
# that choice only in the account: it commits a `CNAME` file to the serving
# branch, and it reads the domain back from that file. So the next run of this
# script used to publish a tree without it, GitHub read the absence as "the
# custom domain was removed", and `marisstella.dev` stopped serving -- with no
# error anywhere, a green workflow, and this script printing "pushed".
#
# That is not hypothetical on the path the repository is currently on:
# `.github/workflows/publish-pages-branch.yml` runs this on every merge to
# `main` once `PAGES_BRANCH_PUBLISH` is `true`, so the domain would have been
# unset automatically, minutes after the owner set it, over and over.
#
# So the domain is *carried forward* from the branch unless it is explicitly
# changed, and it also decides the site's base URL -- a canonical tag pointing
# at the github.io project URL on every page of a custom-domain site is an SEO
# defect this repository has already paid for once.
#
#   PAGES_CNAME=marisstella.dev   set (or change) the custom domain
#   PAGES_CNAME=                  deliberately drop it -- the empty string is
#                                 the only way to remove one, precisely so that
#                                 it cannot happen by omission
#   unset                         carry forward whatever the branch has
#
# What it deliberately does NOT do
# --------------------------------
# It does not enable GitHub Pages. Publishing under the portfolio's public
# name is the account owner's decision (see CLAUDE.md, "Only flag the owner
# when you cannot finish without them"), so this writes the artifact to a
# branch and stops. It also does not push unless asked: set `PUSH=1`.
#
# **That is a statement about this script, not about the site** -- and the two
# were run together here for days. This block used to end "nothing is
# reachable by a stranger until the owner flips the Settings switch", which
# was true when written and quietly stopped being true: Pages became
# branch-sourced, GitHub built `gh-pages` on every push, and the script went
# on telling every reader the catalogue was dark. Measured 2026-09-06 -- the
# managed builder `dynamic/pages/pages-build-deployment` ran on `gh-pages` and
# succeeded (runs 34011996382, 34012041708), which only happens for the
# configured Pages source.
#
# So this script cannot tell you whether the site serves, and no longer
# pretends to. `platform/ci/pages_state.py` can, from GitHub's own builder;
# it is what the closing report prints.
#
# Usage
# -----
#   CONFIRM=publish-pages-branch ./platform/pages/publish-branch.sh
#   CONFIRM=publish-pages-branch PUSH=1 ./platform/pages/publish-branch.sh
#
# Environment:
#   CONFIRM           required, must be exactly `publish-pages-branch`
#   PUSH              set to 1 to push the branch to `origin`
#   BRANCH            branch to write (default `gh-pages`)
#   PAGES_BASE_URL    passed through to build.mjs; defaults to the custom
#                     domain when there is one, else the project Pages URL
#   PAGES_CNAME       custom domain to publish; unset carries the branch's
#                     existing one forward, empty removes it
set -euo pipefail

readonly REQUIRED_CONFIRM='publish-pages-branch'
BRANCH="${BRANCH:-gh-pages}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"

die() { printf 'publish-branch: %s\n' "$*" >&2; exit 1; }
say() { printf '  %s\n' "$*"; }

[ "${CONFIRM:-}" = "$REQUIRED_CONFIRM" ] || die \
  "refusing to run without CONFIRM=$REQUIRED_CONFIRM (this rewrites the '$BRANCH' branch)"

command -v node >/dev/null 2>&1 || die 'node is not on PATH'
git -C "$repo_root" rev-parse --git-dir >/dev/null 2>&1 || die "$repo_root is not a git repository"

# Resolve the custom domain before the build, because it decides the base URL
# that `build.mjs` bakes into every canonical tag, every `sitemap.xml` and the
# Atom feed. Deciding it afterwards would publish a custom-domain site whose
# every page tells a crawler the real address is somewhere else.
resolve_cname() {
  # An explicitly set `PAGES_CNAME` wins, including when it is empty: dropping
  # a custom domain has to be something you *type*, never something that
  # happens because a lookup came back quiet.
  if [ "${PAGES_CNAME+set}" = 'set' ]; then
    printf '%s' "$PAGES_CNAME"
    return 0
  fi
  local ref
  for ref in "refs/heads/$BRANCH" "refs/remotes/origin/$BRANCH"; do
    git -C "$repo_root" rev-parse --verify --quiet "$ref" >/dev/null 2>&1 || continue
    git -C "$repo_root" cat-file -e "$ref:CNAME" 2>/dev/null || continue
    git -C "$repo_root" show "$ref:CNAME" 2>/dev/null | head -n 1
    return 0
  done
  printf ''
}

# `actions/checkout` fetches one branch, so inside the publishing workflow the
# serving branch is not in the clone at all -- which is precisely where an
# unnoticed drop would be automated. Fetch it before reading, and when the ref
# exists on the remote but cannot be fetched, refuse rather than publish a tree
# whose CNAME state was guessed.
if [ "${PAGES_CNAME+set}" != 'set' ] \
  && ! git -C "$repo_root" rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null 2>&1 \
  && git -C "$repo_root" remote | grep -qx origin; then
  if git -C "$repo_root" ls-remote --exit-code origin "refs/heads/$BRANCH" >/dev/null 2>&1; then
    # Forced (`+`), because this script republishes `$BRANCH` as an *orphan*
    # commit every time: each publish rewrites its history rather than adding to
    # it, so the remote ref is never a fast-forward of the tracking ref a
    # previous fetch left behind. Without the `+` the second publish from any
    # clone that has fetched this branch once is rejected as non-fast-forward,
    # the guard below reads that as "cannot read the branch", and publishing
    # stops -- refusing precisely when it is most needed, since the manual run is
    # the only route to the live site while Actions runners are starved.
    #
    # CI never saw it: `actions/checkout` fetches one branch, so no tracking ref
    # exists there and the plain fetch always succeeds. This failed only in a
    # long-lived clone, which is where every by-hand publish happens.
    #
    # Safe because the refspec writes a remote-*tracking* ref and nothing else.
    # `+refs/heads/*:refs/remotes/origin/*` is what an ordinary `git fetch
    # origin` already uses; dropping the `+` here was the deviation.
    if ! git -C "$repo_root" fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null; then
      if [ "${PUSH:-}" = '1' ]; then
        die "cannot read the existing '$BRANCH' branch, so publishing could silently drop a custom domain; retry, or pass PAGES_CNAME explicitly"
      fi
      say "warning: could not fetch '$BRANCH'; any existing custom domain is unknown"
    fi
  fi
fi

cname="$(resolve_cname | tr -d '[:space:]')"
if [ -n "$cname" ]; then
  # A CNAME file GitHub cannot parse is worse than none: it fails the domain
  # over without saying so. Only a bare hostname is publishable.
  case "$cname" in
    *[!A-Za-z0-9.-]* | -* | *- | .* | *. | *..*)
      die "not a bare hostname, refusing to publish it as a custom domain: '$cname'" ;;
    *.*) : ;;
    *) die "a Pages custom domain must be fully qualified, got: '$cname'" ;;
  esac
  export PAGES_BASE_URL="${PAGES_BASE_URL:-https://$cname/}"
fi

# Everything happens in a scratch directory: the build output and a private
# index file. The working tree and the checked-out branch are never touched,
# which is what makes this safe to run mid-session on a dirty tree.
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
dist="$scratch/dist"

echo "Building the site..."
( cd "$here" && node build.mjs --out="$dist" >/dev/null )
say "built $(find "$dist" -type f | wc -l | tr -d ' ') files"
if [ -n "$cname" ]; then
  say "custom domain: $cname (base URL ${PAGES_BASE_URL})"
else
  say "custom domain: none (serves at the project Pages URL)"
fi

# Against the artifact, not the sources: a dead link or a stale canonical is
# created by the copy step, so only the output can show it. Publishing one is
# expensive to undo once a crawler has read it.
echo "Checking the built artifact..."
( cd "$here" && node check.mjs "$dist" )

# Without this, GitHub Pages runs the output through Jekyll, which silently
# drops any path with a leading underscore. Nothing here uses one today, but
# the failure mode is a missing page rather than an error, so the guard is
# worth its one byte.
: > "$dist/.nojekyll"

# GitHub reads the custom domain back out of this file on every deploy, so it
# has to be in every tree this script writes, not only the one where it was
# first set. Written after `check.mjs` for the same reason `.nojekyll` is:
# it is Pages configuration rather than a page, and nothing links to it.
if [ -n "$cname" ]; then
  printf '%s\n' "$cname" > "$dist/CNAME"
fi

# Build the commit with plumbing rather than a checkout. `git add` needs an
# index, so it gets a throwaway one; the repository's real index is untouched.
export GIT_INDEX_FILE="$scratch/index"
git -C "$repo_root" --work-tree="$dist" add -A
tree="$(git -C "$repo_root" write-tree)"
unset GIT_INDEX_FILE

source_sha="$(git -C "$repo_root" rev-parse HEAD)"
message="Publish site built from ${source_sha}

Generated by platform/pages/publish-branch.sh from platform/pages/build.mjs.
Do not edit this branch by hand -- re-run the script instead.

Whether this is served depends on the Pages source, which is a repository
setting rather than anything this commit controls. Ask
platform/ci/pages_state.py -- it reports \`deployed\` from GitHub's own
managed builder rather than assuming either way."

# An orphan commit each time. The branch is a published snapshot, not a
# history worth keeping, and carrying 38 MB of parents forward would bloat
# every clone of the repository for no gain.
commit="$(printf '%s' "$message" | git -C "$repo_root" commit-tree "$tree")"
git -C "$repo_root" update-ref "refs/heads/$BRANCH" "$commit"

echo
say "wrote refs/heads/$BRANCH -> $commit"
say "source commit: $source_sha"

if [ "${PUSH:-}" = '1' ]; then
  echo
  echo "Pushing $BRANCH to origin..."
  # Force, because each run is a fresh orphan commit with no ancestry in
  # common with the last one. Safe here precisely because the branch holds no
  # authored work: everything on it is regenerated from `main` by this script.
  git -C "$repo_root" push --force origin "refs/heads/$BRANCH:refs/heads/$BRANCH"
  say "pushed"
else
  echo
  say "not pushed (set PUSH=1 to push)"
fi

# Deliberately not a fixed "staged, not served" line any more.
#
# This script used to end by telling every reader the snapshot was staged and
# the owner still had to flip Settings -> Pages. That was true when it was
# written and silently stopped being true: Pages was branch-sourced at some
# point, GitHub built `gh-pages` on every push, and the script went on saying
# nobody could reach it. A session then ranked an owner ask that was already
# granted -- the exact "manifest-derived claim restated as a claim about what
# a visitor receives" that CLAUDE.md records going wrong before.
#
# So ask, do not assert. pages_state.py reads GitHub's managed builder and can
# distinguish "configured" from "actually deployed"; if it cannot be reached,
# say that rather than substituting the old guess.
echo
if state="$(python3 "$repo_root/platform/ci/pages_state.py" 2>/dev/null)"; then
  printf '%s\n' "$state"
else
  cat <<EOF
Could not read the Pages state (platform/ci/pages_state.py needs a token with
Actions: read). Whether this snapshot is served is therefore unknown from here
-- check Settings -> Pages, and do not assume either answer.
EOF
fi

# The custom domain is reported separately from the state above, and from this
# snapshot rather than from the API: it is a property of the tree just written,
# so it is knowable here even when pages_state.py cannot be reached.
if [ -n "$cname" ]; then
  cat <<EOF

This snapshot carries the custom domain ${cname}, so it serves there once DNS
points at GitHub Pages -- see portfolio/hosting/README.md for the records.
EOF
else
  cat <<EOF

It will serve at the project Pages URL. To serve a custom domain instead, set
it in Settings -> Pages; this script carries it forward from then on.
EOF
fi

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
#   ALLOW_REGRESSION  set to 1 to publish anyway when the branch already
#                     carries a snapshot built from a NEWER commit than this
#                     one -- see "Publishing backwards" below
#   ALLOW_UNMERGED_SOURCE
#                     set to 1 to publish a HEAD that is not on `origin/main`
#                     -- see "Publishing something that is not on `main`"
#                     below. Building without PUSH=1 never needs this.
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

# Tell IndexNow-participating engines that the snapshot just pushed exists.
#
# WHY THIS LIVES HERE AND NOT ONLY IN THE WORKFLOW
#
# `.github/workflows/publish-pages-branch.yml` has had a `Notify IndexNow` step
# since the script was written, and `platform/marketing/README.md` closed its
# IndexNow section with "Run it after any `publish-branch.sh` that actually
# pushes." Both were correct and neither ran, because that workflow needs an
# Actions runner and runners have been starved since 2026-09-04 -- so every
# publish that has actually reached the live site in that window was a by-hand
# run of *this* script, and every one of them skipped the announcement in
# silence. The prose reminder was the only thing standing in the gap, which is
# the failure mode this repository has now recorded three times against
# `pages_state.py --require-current`, `platform/proposal/` and the front-door
# mirror: a reminder competes with everything else in a long file, and an
# executed step does not.
#
# It matters more here than the usual "keep two routes in step", because
# IndexNow is not a nice-to-have on this origin. `pages_state.py`'s `indexing`
# row measured that `robots.txt` -- and the `Sitemap:` line naming all 882
# published pages -- is unreachable to a crawler on a project-Pages subpath, so
# sitemap auto-discovery has never once happened for this catalogue. IndexNow
# is the one enumeration route that survives that, because it names its key's
# location in the request instead of assuming the host root. Skipping it left
# the catalogue with no enumeration route at all.
#
# WHY IT NEVER FAILS THE PUBLISH
#
# By the time this runs the force-push has already succeeded and the site is
# live. Failing the script here would report a *successful deploy* as a failure
# -- and the most likely reason to fail is that the host has no egress to
# api.indexnow.org, which was true of every agent session sandbox tested
# through 2026-09-11 and is not a defect in anything. So this reports and
# returns 0. What it must not do is report *nothing*: the announcement is loud
# either way, which is the whole point of moving it out of prose.
#
# CORRECTED 2026-09-24: "every agent session sandbox" was an overclaim. A
# scheduled session's run of this exact script reached api.indexnow.org and
# got a real 200 (1557 URLs, `POST https://api.indexnow.org/indexnow -> 200`),
# where every prior reading through 2026-09-11 had gotten a 403 at CONNECT.
# Egress policy is evidently per-session-type or per-environment rather than a
# fixed property of "an agent sandbox" -- so treat the 403 as the common case
# to plan around, not a guarantee, and keep trying this route rather than
# assuming it is dead. `indexnow_state.py` still reports `never` after this,
# because it reads only GitHub workflow run history and has no way to record
# a by-hand submission -- that gap is real and is not what this correction
# is about.
#
# `INDEXNOW=0` skips it, for a publish you deliberately do not want announced
# (a rollback, or a snapshot you are about to replace).
#
# INTEGRATION NOTE (2026-09-10). #4378 landed the same core idea from another
# session while this was in review, inline at the call site. Its version is the
# base here rather than a thing to work around: `--ref "$BRANCH"` is its
# improvement over what this had (a non-default `BRANCH` would otherwise have
# been announced from the wrong ref), and its wording is what
# `gitops/tests/test_publish_branch.py` pins, so the strings below match it
# exactly. What this adds on top is the part that version could not express --
# telling "this host cannot reach IndexNow" apart from "IndexNow refused what
# we sent", which needs the distinct exit code added to `indexnow.mjs` in the
# same change -- plus an opt-out and a guard for a host with no node.
announce_to_indexnow() {
  if [ "${INDEXNOW:-1}" = '0' ]; then
    say "IndexNow: skipped (INDEXNOW=0)"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    say "IndexNow: skipped -- no node on PATH. Announce with:"
    say "    node platform/marketing/indexnow.mjs --submit --ref $BRANCH"
    return 0
  fi

  echo
  echo "Notifying IndexNow..."
  local status=0
  node "$repo_root/platform/marketing/indexnow.mjs" --submit --ref "$BRANCH" || status=$?

  case "$status" in
    0)
      say "IndexNow notified"
      ;;
    # `EXIT_NO_EGRESS` in indexnow.mjs: the request never reached IndexNow, so
    # nothing was submitted and nothing was broken. Worth its own branch rather
    # than folding into the generic failure below: it is the *expected* outcome
    # from an agent sandbox, and a reader who cannot tell it from a rejected
    # payload will either chase a defect that is not there or learn to ignore
    # the line entirely. It covers both shapes of that -- the request rejecting
    # outright, and an egress proxy answering 403 in IndexNow's place, which is
    # the one this sandbox actually produces.
    3)
      say "IndexNow submission did not go through -- not fatal, the site is already published."
      say "    This host has no egress to api.indexnow.org, so the request never reached it."
      say "    Re-run 'node platform/marketing/indexnow.mjs --submit --ref $BRANCH' from a"
      say "    host with real egress (an Actions runner, or the Hetzner box under host mode)."
      ;;
    *)
      say "IndexNow submission did not go through -- not fatal, the site is already published. Re-run 'node platform/marketing/indexnow.mjs --submit --ref $BRANCH' from a host with real egress to retry."
      ;;
  esac
  return 0
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

# The self-deploy page (platform/deploy/). Written after `check.mjs` because it
# is a separate static app with its own tests, not a catalogue page: the hub
# footer links to it (check.mjs exempts that one link), and `check.mjs` would read its 1,200 data files as
# orphans.
echo "Building the self-deploy page..."
node "$repo_root/platform/deploy/build.mjs" --out="$dist/deploy" >/dev/null

# The development dashboard (platform/devstats/): merges, lead time, CI and
# review health, branches, and what each agent run cost. Written after
# `check.mjs` like the deploy page, and linked from the hub's overview. With
# GITHUB_TOKEN set (the publish workflow) it adds the GitHub API metrics.
echo "Building the development dashboard..."
node "$repo_root/platform/devstats/build.mjs" --out="$dist/dev" >/dev/null

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
  # Publishing something that is not on `main`.
  #
  # The script publishes whatever HEAD happens to be, and every guard below
  # this point was written about *which* main commit is being published --
  # never about whether it is a main commit at all. So a session sitting on
  # its own feature branch, which is the ordinary state of a session here,
  # ships unreviewed work straight to the live catalogue by running the same
  # command the docs give for a routine refresh. Nothing turns red.
  #
  # Measured 2026-09-07: `gh-pages` was serving a snapshot whose recorded
  # source commit `077c0998` did not exist anywhere in the repository -- not
  # on `main`, not on any branch, not as any object. That is what a publish
  # from a branch looks like afterwards, once the branch is squash-merged
  # (this repo squash-merges, so the original sha is gone) or deleted: the
  # live site cannot be traced back to anything reviewable, and the backwards
  # guard below fails open on it, because `cat-file -e` cannot resolve a
  # commit that no longer exists and the whole condition short-circuits.
  #
  # So: refuse unless HEAD is contained in `origin/main`. A preview build
  # (`PUSH` unset) is untouched -- building a branch to look at it is the
  # normal way to check a change, and it is only the push that reaches users.
  if [ "${ALLOW_UNMERGED_SOURCE:-}" = '1' ]; then
    say "WARNING: publishing $source_sha without checking it is on origin/main,"
    say "         because ALLOW_UNMERGED_SOURCE=1."
  else
    git -C "$repo_root" fetch --quiet origin main 2>/dev/null || true
    main_tip="$(git -C "$repo_root" rev-parse --verify --quiet FETCH_HEAD 2>/dev/null \
      || git -C "$repo_root" rev-parse --verify --quiet origin/main 2>/dev/null || true)"
    if [ -z "$main_tip" ]; then
      die "cannot read origin/main, so cannot tell whether $source_sha is reviewed work.
  Refusing rather than guessing: this push replaces the live site.
  Fix: restore network access to the remote and re-run, or set
  ALLOW_UNMERGED_SOURCE=1 if you have another way to know this is right."
    fi
    # Shallow checkouts (actions/checkout's default) have no ancestry to walk,
    # so unshallow first for the same reason the backwards guard below does.
    if [ "$source_sha" != "$main_tip" ] \
       && [ "$(git -C "$repo_root" rev-parse --is-shallow-repository 2>/dev/null)" = 'true' ]; then
      git -C "$repo_root" fetch --quiet --unshallow origin 2>/dev/null || true
    fi
    if ! git -C "$repo_root" merge-base --is-ancestor "$source_sha" "$main_tip" 2>/dev/null; then
      die "refusing to publish a commit that is not on origin/main: $source_sha
  is not an ancestor of origin/main ($main_tip), so this would put unreviewed
  work on the live catalogue and leave a snapshot nobody can trace back to a
  reviewed commit -- which is exactly what a squash-merge or a deleted branch
  makes of it afterwards.
  Fix: merge the work first, then publish from an up-to-date checkout --
    git fetch origin main && git reset --hard origin/main
    CONFIRM=$REQUIRED_CONFIRM PUSH=1 $0
  Build without PUSH=1 to preview this branch's site without shipping it.
  Override with ALLOW_UNMERGED_SOURCE=1 only if you mean to serve unmerged work."
    fi
  fi

  # Publishing backwards.
  #
  # The force-push below is safe against losing *authored* work -- everything
  # on this branch is regenerated -- and that was read for years as "safe",
  # full stop. It is not. The branch is the live site, so a force-push from an
  # older `main` than the one already published silently REVERTS the site, and
  # nothing anywhere turns red: `pages_state.py` then reports `stale`, which
  # reads as "somebody has not published yet" rather than "somebody undid a
  # publish".
  #
  # Measured 2026-09-06, in the ten minutes it took to notice. Two sessions
  # overlapped: one published 433a68bf (a merge that had just landed), and a
  # concurrent session, still holding 14494ea1, published a second later and
  # took the newly shipped venture off the live site. `session_gate.py` reports
  # up to 4 distinct sessions inside a 15-minute window here, so this is the
  # ordinary case rather than a freak race.
  #
  # So: read the source commit out of the remote tip's own message and refuse
  # when it is strictly ahead of ours. Cheap, and it fails closed only in the
  # one direction that costs live product.
  remote_tip="$(git -C "$repo_root" ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | cut -f1)"
  if [ -n "$remote_tip" ]; then
    # The tip is an orphan commit, so a plain fetch of the branch is enough to
    # read its message; it carries no history to pull along with it.
    git -C "$repo_root" fetch --quiet --depth=1 origin "refs/heads/$BRANCH" 2>/dev/null || true
    published_from="$(git -C "$repo_root" show -s --format=%B "$remote_tip" 2>/dev/null \
      | sed -n 's/^Publish site built from \([0-9a-f]\{7,40\}\).*/\1/p' | head -n1)"
    # `merge-base --is-ancestor` needs $published_from's own ancestry present
    # locally, and `actions/checkout` -- what publish-pages-branch.yml uses,
    # with no `fetch-depth` override -- leaves exactly one commit in the repo.
    # Left alone, `cat-file -e` below fails on every ordinary CI run (the
    # referenced commit is simply absent) and the whole guard falls through
    # silently: no error, just the backwards push it exists to stop. Unshallow
    # first, so the check runs against real history instead of a single
    # commit it was never going to find anything in.
    if [ -n "$published_from" ] && [ "$published_from" != "$source_sha" ] \
       && [ "$(git -C "$repo_root" rev-parse --is-shallow-repository 2>/dev/null)" = 'true' ]; then
      git -C "$repo_root" fetch --quiet --unshallow origin 2>/dev/null || true
    fi
    # "Cannot tell" must not read as "safe", but it must not block the repair
    # either. An unresolvable $published_from means the branch is serving a
    # snapshot built from a commit this repository does not have -- the
    # unmerged-source case guarded above, seen from the other side, after the
    # branch it came from was squash-merged or deleted. Publishing from `main`
    # (which the guard above has just proved this is) is the fix for that, so
    # proceed -- but say so, because a silent fall-through is how it went
    # unnoticed in the first place.
    if [ -n "$published_from" ] && [ "$published_from" != "$source_sha" ] \
       && ! git -C "$repo_root" cat-file -e "${published_from}^{commit}" 2>/dev/null; then
      say "NOTE: '$BRANCH' serves a snapshot built from $published_from, which is"
      say "      not a commit in this repository -- it was published from a branch"
      say "      that has since been squash-merged or deleted, so the live site"
      say "      cannot be traced to a reviewed commit. This push repairs that."
    fi
    if [ -n "$published_from" ] && [ "$published_from" != "$source_sha" ] \
       && git -C "$repo_root" cat-file -e "${published_from}^{commit}" 2>/dev/null \
       && git -C "$repo_root" merge-base --is-ancestor "$source_sha" "$published_from" 2>/dev/null; then
      if [ "${ALLOW_REGRESSION:-}" = '1' ]; then
        say "WARNING: $BRANCH already serves a newer snapshot ($published_from);"
        say "         publishing over it anyway because ALLOW_REGRESSION=1."
      else
        die "refusing to publish backwards: '$BRANCH' already serves a snapshot built
  from $published_from, which is NEWER than this one ($source_sha). Pushing
  would take whatever landed in between off the live site, and nothing would
  report it as an error.
  Another session almost certainly published while this one was building.
  Fix: re-run from an up-to-date checkout --
    git fetch origin main && git reset --hard origin/main
    CONFIRM=$REQUIRED_CONFIRM PUSH=1 $0
  Override with ALLOW_REGRESSION=1 only if you mean to roll the site back."
      fi
    fi
  fi
  echo "Pushing $BRANCH to origin..."
  # Force, because each run is a fresh orphan commit with no ancestry in
  # common with the last one. Safe against losing authored work -- everything
  # on the branch is regenerated from `main` by this script -- with the
  # backwards case ruled out just above.
  git -C "$repo_root" push --force origin "refs/heads/$BRANCH:refs/heads/$BRANCH"
  say "pushed"
  announce_to_indexnow
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

#!/usr/bin/env bash
#
# Resolve a merge conflict in the generated front-door mirror.
#
# WHY THIS EXISTS
#
# `gitops/prod/front-door-tools/` is generated output that is committed,
# because Argo CD delivers it and a merge to `main` is the deploy — there is
# no CI job that could build it after the fact. `front-door-tools.mjs` packs
# the mirror into ConfigMap shards *sequentially*, so inserting one page
# shifts every file after it into a different shard. Two branches that each
# add a page therefore always conflict, in `kustomization.yaml` and often in
# whichever `.gz` blobs moved.
#
# That conflict has exactly one correct resolution and it is never "pick a
# side": both sides are stale the moment they are merged, because the right
# answer is whatever the generator produces from the *merged* sources. Picking
# either branch's copy leaves the apex serving a mirror that does not match the
# ventures on `main` — the page absent, or an `index.html` without its own
# footer link.
#
# On 2026-09-02 five separate branches hit this within an hour and each one was
# resolved by hand, by re-deriving the same four commands. This script is those
# four commands with the guardrails that make them safe to run blind.
#
# USAGE
#
#   git merge origin/main            # conflicts
#   ./platform/marketing/resolve-mirror-merge.sh
#   git commit                       # you write the message
#
# It deliberately does not commit: the commit message should say what the merge
# was for, and only the caller knows that.
set -euo pipefail

# Kept in step with `OUTPUT_DIR` in front-door-tools.mjs by
# `resolve-mirror-merge.test.mjs`, so a move of the generator's output cannot
# silently narrow this script's scope to a directory nothing writes.
MIRROR_DIR="gitops/prod/front-door-tools"
GENERATOR="platform/marketing/front-door-tools.mjs"

cd "$(git rev-parse --show-toplevel)"

if ! git rev-parse --verify --quiet MERGE_HEAD >/dev/null; then
  echo "No merge in progress. Run this after \`git merge\` reports conflicts." >&2
  exit 1
fi

mapfile -t conflicted < <(git diff --name-only --diff-filter=U)

if [ ${#conflicted[@]} -eq 0 ]; then
  echo "No conflicted paths. Nothing for this script to resolve." >&2
  exit 1
fi

# The one thing this script must never do is wave through a conflict in hand
# written code as though it were regenerable. Anything outside the mirror is a
# real edit that two people made to the same lines, and it needs a human
# reading both sides.
outside=()
for path in "${conflicted[@]}"; do
  case "$path" in
    "$MIRROR_DIR"/*) ;;
    *) outside+=("$path") ;;
  esac
done

if [ ${#outside[@]} -gt 0 ]; then
  echo "Conflicts outside $MIRROR_DIR — resolve these by hand first:" >&2
  printf '  %s\n' "${outside[@]}" >&2
  echo >&2
  echo "This script only resolves generated mirror output. It will not touch" >&2
  echo "a conflict in authored code." >&2
  exit 1
fi

echo "Resolving ${#conflicted[@]} conflicted mirror file(s) by regenerating."

# Clear the conflict markers before regenerating. Which side we take is
# irrelevant — every one of these files is about to be overwritten by the
# generator — but `--ours` leaves a valid tree if the generator then fails, and
# a kustomization carrying `<<<<<<<` markers is not valid YAML.
git checkout --ours -- "$MIRROR_DIR"
git add -- "$MIRROR_DIR"

node "$GENERATOR" --write

git add -- "$MIRROR_DIR"

echo
echo "Verifying the regenerated mirror against the merged sources."
node --test "platform/marketing/*.test.mjs"

echo
echo "Mirror resolved and staged. Review with:"
echo "  git diff --cached --stat -- $MIRROR_DIR"
echo "Then commit — this script leaves the message to you."

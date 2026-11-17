#!/usr/bin/env bash
# Sparse-checkout the ventures a change needs: those BASE..HEAD touched, plus
# every sibling venture their files name as `../<slug>/` or `ventures/<slug>/`
# (footer-link tests read the sibling's index.html, marketplace-fee-compare
# imports fifteen sibling calc.mjs), followed two hops deep.
# Used by ventures-tests.yml after a `sparse-checkout: platform .github docs
# portfolio` checkout (P063, docs/history/ci-perf-2026-11-07-ventures-sparse-checkout.md).
# Usage: platform/ci/sparse_ventures.sh BASE   (empty/zero/unknown BASE: whole tree)
set -eu
BASE="${1:-}"
if [ -z "$BASE" ] || [ "$BASE" = "0000000000000000000000000000000000000000" ] \
   || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  git sparse-checkout disable
  exit 0
fi
known=$(git ls-tree --name-only HEAD ventures/ | sed 's|^ventures/||' | sort -u)
have=$(git diff --name-only --no-renames "$BASE" HEAD -- ventures | awk -F/ 'NF > 2 {print $2}' | sort -u)
[ -n "$have" ] || exit 0
for _ in 1 2 3; do
  # shellcheck disable=SC2086
  git sparse-checkout add $(printf 'ventures/%s ' $have)
  refs=$( (cd ventures && grep -rIhoE --exclude-dir=node_modules -e '(\.\./|ventures/)[a-z0-9][a-z0-9._-]*/' $have 2>/dev/null) \
          | sed -E 's|^(\.\./\|ventures/)||; s|/$||' | sort -u | comm -12 - <(printf '%s\n' "$known") || true)
  next=$(printf '%s\n%s\n' "$have" "$refs" | sed '/^$/d' | sort -u)
  [ "$next" != "$have" ] || break
  have="$next"
done
git sparse-checkout add $(printf 'ventures/%s ' $have)

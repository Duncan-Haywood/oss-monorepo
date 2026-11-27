#!/usr/bin/env bash
# Refresh ventures/jobshop-quote from a private-monorepo checkout, then audit it.
#
#   ventures/jobshop-quote/sync-from-private.sh /path/to/private-monorepo
#
# Only needed while private-monorepo is still where Job Shop Quote is built (README.md,
# "Where the work happens"). It runs the pre-publication audit on the source first and
# stops on any block finding, replaces apps/, packages/ and scripts/ with the source's
# tracked files (git archive: no node_modules, no .dev.vars), re-applies the public-repo
# rewrites, formats the lines they lengthened, prunes the lockfile to this workspace,
# and prints what changed. Files that exist only here (README.md, LICENSE, DEPLOY.md,
# VENTURE.yaml, docs/, this script) are left alone. Review the diff before committing:
# publishing cannot be undone. Same steps as ventures/payapps/sync-from-private.sh.
set -euo pipefail

src="${1:?usage: sync-from-private.sh /path/to/private-monorepo}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

paths=(apps/jobshop-quote apps/jobshop-site packages/billing packages/admin-metrics
  packages/cad-features packages/qbo-sync scripts/check-no-client-maps.mjs
  scripts/check-no-client-maps.test.mjs)

python3 "$repo/platform/security/prepub_audit.py" "$src" "${paths[@]}" \
  --out "$here/.prepub-audit.md" || {
  echo "prepub audit found block findings in $src: nothing copied (see $here/.prepub-audit.md)" >&2
  exit 1
}

rm -rf "$here/apps" "$here/packages" "$here/scripts"
git -C "$src" archive HEAD "${paths[@]}" package.json pnpm-workspace.yaml pnpm-lock.yaml \
  biome.json tsconfig.base.json | tar -x -C "$here"

# Public-repo rewrites (docs/reports/2026-11-27-move-jobshop-quote-public.md).
sed -i 's#"name": "private-monorepo"#"name": "jobshop-quote-workspace"#' "$here/package.json"
grep -rlZ '@private-monorepo/\|@private/' "$here/packages" "$here/apps" |
  xargs -0 -r sed -i 's#@private-monorepo/#@jobshop-quote/#g; s#@private/#@jobshop-quote/#g'
python3 "$here/rewrite_public.py" "$here"

(cd "$here" && pnpm install --lockfile-only >/dev/null && pnpm install --frozen-lockfile >/dev/null &&
  pnpm exec biome format --write apps packages >/dev/null)
echo "synced from $(git -C "$src" rev-parse --short HEAD); review: git -C $repo status --short ventures/jobshop-quote"

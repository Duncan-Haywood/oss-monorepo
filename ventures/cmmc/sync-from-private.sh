#!/usr/bin/env bash
# Refresh ventures/cmmc from a private-monorepo checkout, then audit it.
#
#   ventures/cmmc/sync-from-private.sh /path/to/private-monorepo
#
# Only needed while private-monorepo is still where CMMC Workspace is built (README.md,
# "Where the work happens"). It runs the pre-publication audit on the source first and
# stops on any block finding, replaces apps/, packages/ and scripts/ with the source's
# tracked files (git archive: no node_modules, no .dev.vars), re-applies the public-repo
# rewrites, prunes the lockfile to this workspace, and prints what changed. Files that
# exist only here (README.md, LICENSE, DEPLOY.md, VENTURE.yaml, docs/, this script) are
# left alone. Review the diff before committing: publishing cannot be undone. Same steps
# as ventures/jobshop-quote/sync-from-private.sh.
set -euo pipefail

src="${1:?usage: sync-from-private.sh /path/to/private-monorepo}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

paths=(apps/cmmc apps/cmmc-site packages/billing packages/admin-metrics
  scripts/check-no-client-maps.mjs scripts/check-no-client-maps.test.mjs)

python3 "$repo/platform/security/prepub_audit.py" "$src" "${paths[@]}" \
  --out "$here/.prepub-audit.md" || {
  echo "prepub audit found block findings in $src: nothing copied (see $here/.prepub-audit.md)" >&2
  exit 1
}

rm -rf "$here/apps" "$here/packages" "$here/scripts"
git -C "$src" archive HEAD "${paths[@]}" package.json pnpm-workspace.yaml pnpm-lock.yaml \
  biome.json tsconfig.base.json | tar -x -C "$here"

# Public-repo rewrites (docs/reports/2026-11-27-move-cmmc-public.md).
sed -i 's#"name": "private-monorepo"#"name": "cmmc-workspace-root"#' "$here/package.json"
grep -rlZ '@private-monorepo/\|@private/' "$here/packages" "$here/apps" |
  xargs -0 -r sed -i 's#@private-monorepo/#@cmmc/#g; s#@private/#@cmmc/#g'
# Made-up addresses on real, registrable domains move to the reserved .example TLD (RFC 2606).
grep -rlZ --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.md' \
  'company\.com' "$here/apps" "$here/packages" |
  xargs -0 -r sed -i 's#@company\.com\b#@company.example#g'

(cd "$here" && pnpm install --lockfile-only >/dev/null && pnpm install --frozen-lockfile >/dev/null &&
  pnpm exec biome format --write apps packages >/dev/null)
echo "synced from $(git -C "$src" rev-parse --short HEAD); review: git -C $repo status --short ventures/cmmc"

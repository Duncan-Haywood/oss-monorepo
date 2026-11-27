#!/usr/bin/env bash
# Refresh ventures/payapps from a private-monorepo checkout, then audit it.
#
#   ventures/payapps/sync-from-private.sh /path/to/private-monorepo
#
# Only needed while private-monorepo is still where PayApps is built (README.md,
# "Where the work happens"). It runs the pre-publication audit on the source
# first and stops on any block finding, replaces apps/, packages/ and scripts/
# with the source's tracked files (git archive: no node_modules, no .dev.vars),
# re-applies the public-repo rewrites, prunes the lockfile to this workspace,
# and prints the diff summary. Files that exist only here (README.md, LICENSE,
# DEPLOY.md, docs/, this script) are left alone. Review the diff before
# committing: publishing cannot be undone.
set -euo pipefail

src="${1:?usage: sync-from-private.sh /path/to/private-monorepo}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

paths=(apps/payapps apps/payapps-site packages/billing packages/admin-metrics
  packages/lien-waivers packages/qbo-sync scripts/check-no-client-maps.mjs
  scripts/check-no-client-maps.test.mjs)

python3 "$repo/platform/security/prepub_audit.py" "$src" "${paths[@]}" \
  --out "$here/.prepub-audit.md" || {
  echo "prepub audit found block findings in $src: nothing copied (see $here/.prepub-audit.md)" >&2
  exit 1
}

rm -rf "$here/apps" "$here/packages" "$here/scripts"
git -C "$src" archive HEAD "${paths[@]}" package.json pnpm-workspace.yaml pnpm-lock.yaml \
  biome.json tsconfig.base.json | tar -x -C "$here"

# Public-repo rewrites (docs/reports/2026-11-27-move-payapps-public.md).
sed -i 's#"name": "private-monorepo"#"name": "payapps-workspace"#' "$here/package.json"
grep -rlZ '@private-monorepo/' "$here/packages" | xargs -0 -r sed -i 's#@private-monorepo/#@payapps/#g'
python3 "$here/rewrite_public.py" "$here"

(cd "$here" && pnpm install --lockfile-only >/dev/null)
# The .example addresses are longer, so a few lines need reformatting (biome ci fails otherwise).
(cd "$here" && pnpm install --frozen-lockfile >/dev/null && pnpm exec biome check --write apps >/dev/null || true)
echo "synced from $(git -C "$src" rev-parse --short HEAD); review: git -C $repo status --short ventures/payapps"

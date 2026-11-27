#!/usr/bin/env bash
# Refresh ventures/seller-books from a private-monorepo checkout, then audit it.
#
#   ventures/seller-books/sync-from-private.sh /path/to/private-monorepo
#
# Only needed while private-monorepo is still where Seller Books is built (README.md,
# "Where the work happens"). It runs the pre-publication audit on the source first and stops on
# any block finding, replaces apps/, packages/ and scripts/ with the source's tracked files
# (git archive: no node_modules, no .dev.vars), re-applies the public-repo rewrites, prunes the
# lockfile to this workspace, and prints the diff summary. Files that exist only here (README.md,
# LICENSE, DEPLOY.md, VENTURE.yaml, this script) are left alone. Review the diff before committing:
# publishing cannot be undone.
set -euo pipefail

src="${1:?usage: sync-from-private.sh /path/to/private-monorepo}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

paths=(apps/seller-books apps/seller-books-site packages/billing packages/admin-metrics
  scripts/check-no-client-maps.mjs scripts/check-no-client-maps.test.mjs)

python3 "$repo/platform/security/prepub_audit.py" "$src" "${paths[@]}" \
  --out "$here/.prepub-audit.md" || {
  echo "prepub audit found block findings in $src: nothing copied (see $here/.prepub-audit.md)" >&2
  exit 1
}

rm -rf "$here/apps" "$here/packages" "$here/scripts"
git -C "$src" archive HEAD "${paths[@]}" package.json pnpm-workspace.yaml pnpm-lock.yaml \
  biome.json tsconfig.base.json .gitignore .nvmrc | tar -x -C "$here"

# Public-repo rewrites (docs/reports/2026-11-27-move-seller-books-public.md).
sed -i 's#"name": "private-monorepo"#"name": "seller-books-workspace"#' "$here/package.json"
grep -rlZ '@private-monorepo/' "$here/packages" "$here/apps" | xargs -0 -r sed -i 's#@private-monorepo/#@seller-books/#g'
sed -i 's#a.b+c@sub.example.co"#a.b+c@sub.example.com"#' "$here/apps/seller-books-site/test/early-access.test.mjs"
python3 - "$here/apps/seller-books/docs/DEPLOY.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("[`.github/workflows/seller-books-deploy.yml`](../../../.github/workflows/seller-books-deploy.yml)",
              "`seller-books-deploy.yml` (in private-monorepo; not ported to this repository yet, see\n[the venture's DEPLOY.md](../../../DEPLOY.md))")
open(p, "w").write(s)
PY

(cd "$here" && pnpm install --lockfile-only >/dev/null)
echo "synced from $(git -C "$src" rev-parse --short HEAD); review: git -C $repo status --short ventures/seller-books"

#!/usr/bin/env bash
# Refresh ventures/einvoice-pro from a private-monorepo checkout, then audit it.
#
#   ventures/einvoice-pro/sync-from-private.sh /path/to/private-monorepo
#
# Only needed while private-monorepo is still where the paid edition is built (README.md,
# "Where the work happens"). It runs the pre-publication audit on the source first and stops on
# any block finding, replaces apps/ and packages/ with the source's tracked files (git archive: no
# node_modules, no secrets files), re-applies the public-repo rewrites, and prints what changed.
# Files that exist only here (README.md, LICENSE, DEPLOY.md, VENTURE.yaml, this script) are left
# alone. The fixes the public checks forced on 2026-11-27 (CodeQL, the stdin tests) were also opened
# against private-monorepo; if a refresh brings back an old line, `git diff` shows it. Review the
# diff before committing: publishing cannot be undone.
set -euo pipefail

src="${1:?usage: sync-from-private.sh /path/to/private-monorepo}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

paths=(apps/einvoice-preflight apps/einvoice-site packages/billing packages/admin-metrics)

python3 "$repo/platform/security/prepub_audit.py" "$src" "${paths[@]}" \
  --out "$here/.prepub-audit.md" || {
  echo "prepub audit found block findings in $src: nothing copied (see $here/.prepub-audit.md)" >&2
  exit 1
}

rm -rf "$here/apps" "$here/packages"
git -C "$src" archive HEAD "${paths[@]}" | tar -x -C "$here"

# Public-repo rewrites (docs/reports/2026-11-27-move-einvoice-pro-public.md).
grep -rlZ '@private-monorepo/' "$here/packages" | xargs -0 -r sed -i 's#@private-monorepo/#@einvoice-pro/#g'
sed -i 's/@\([Kk]\)anzlei\.de/@\1anzlei.example/g' "$here/apps/einvoice-site/test/worker.test.mjs"
sed -i "s#see the repository's root LICENSE.#see ventures/einvoice-pro/LICENSE.#" "$here/apps/einvoice-preflight/LICENSE"
# The Python CLI stays in the free edition (README.md); the JavaScript tests' shared fixture stays.
rm -rf "$here/apps/einvoice-preflight/src" "$here/apps/einvoice-preflight/pyproject.toml"
rm -f "$here"/apps/einvoice-preflight/tests/*.py
# NEXT.md's links were written two levels up from ventures/einvoice-preflight; here they sit four up.
sed -i 's#](\.\./\.\./portfolio/#](../../../../portfolio/#g' "$here/apps/einvoice-preflight/NEXT.md"
rm -f "$here/.prepub-audit.md"
echo "synced from $(git -C "$src" rev-parse --short HEAD); review: git -C $repo status --short ventures/einvoice-pro"

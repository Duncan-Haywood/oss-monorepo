#!/usr/bin/env bash
# Refresh ventures/residential-takeoff/apps/wall-framing-takeoff from a private-monorepo checkout,
# then audit it.
#
#   ventures/residential-takeoff/sync-from-private.sh /path/to/private-monorepo
#
# Only needed while the private copy still exists (README.md, "Where the work happens"). It runs the
# pre-publication audit on the source first and stops on any block finding, replaces apps/ with the
# source's tracked files (git archive), puts this directory's all-rights-reserved LICENSE over the
# app's (whose text points at the private repository's root licence), drops the app's own
# VENTURE.yaml (this directory's is the registry entry; the app's named the free edition), and prints
# what changed. README.md, LICENSE, VENTURE.yaml and this script are left alone. Review the diff
# before committing: publishing cannot be undone. Same steps as ventures/jobshop-quote/sync-from-private.sh,
# without the pnpm ones (the app has no package.json).
set -euo pipefail

src="${1:?usage: sync-from-private.sh /path/to/private-monorepo}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
app=apps/wall-framing-takeoff

python3 "$repo/platform/security/prepub_audit.py" "$src" "$app" --out "$here/.prepub-audit.md" || {
  echo "prepub audit found block findings in $src: nothing copied (see $here/.prepub-audit.md)" >&2
  exit 1
}

rm -rf "$here/apps"
git -C "$src" archive HEAD "$app" | tar -x -C "$here"
cp "$here/LICENSE" "$here/$app/LICENSE"
rm -f "$here/$app/VENTURE.yaml"
echo "synced from $(git -C "$src" rev-parse --short HEAD); review: git -C $repo status --short ventures/residential-takeoff"

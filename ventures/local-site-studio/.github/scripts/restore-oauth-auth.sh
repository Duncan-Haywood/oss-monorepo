#!/usr/bin/env bash
# Restore an OAuth credential file for a CLI agent.
# Usage: restore-oauth-auth.sh <target-path> <secret-env-var-name> [cache-hint]
set -euo pipefail

TARGET_PATH="${1:?target path required}"
SECRET_ENV="${2:?secret env var name required}"

mkdir -p "$(dirname "$TARGET_PATH")"
chmod 700 "$(dirname "$TARGET_PATH")" 2>/dev/null || true

SECRET_VALUE="${!SECRET_ENV-}"

# The secret is the source of truth: a fresh secret always overwrites
# whatever the actions/cache restore step left behind, since that cache
# can hold a stale or invalid credential from a previous failed run and
# would otherwise wedge the workflow forever (it never re-checks the
# secret once a file exists).
if [[ -n "$SECRET_VALUE" ]]; then
  # Write without a trailing-newline surprise when the secret is raw JSON.
  printf '%s' "$SECRET_VALUE" > "$TARGET_PATH"
  chmod 600 "$TARGET_PATH"
  echo "Seeded OAuth auth file at $TARGET_PATH from \$${SECRET_ENV}"
  exit 0
fi

if [[ -s "$TARGET_PATH" ]]; then
  echo "Auth file already present at $TARGET_PATH (no \$${SECRET_ENV} set, using cached credentials)"
  chmod 600 "$TARGET_PATH"
  exit 0
fi

echo "::error::Missing OAuth secret \$${SECRET_ENV}. Seed it from a local login (see /docs/cli-agents)."
exit 1

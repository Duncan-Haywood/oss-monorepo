#!/usr/bin/env bash
# Restore an OAuth credential file for a CLI agent.
# Usage: restore-oauth-auth.sh <target-path> <secret-env-var-name> [cache-hint]
set -euo pipefail

TARGET_PATH="${1:?target path required}"
SECRET_ENV="${2:?secret env var name required}"

mkdir -p "$(dirname "$TARGET_PATH")"
chmod 700 "$(dirname "$TARGET_PATH")" 2>/dev/null || true

if [[ -s "$TARGET_PATH" ]]; then
  echo "Auth file already present at $TARGET_PATH"
  chmod 600 "$TARGET_PATH"
  exit 0
fi

SECRET_VALUE="${!SECRET_ENV-}"
if [[ -z "$SECRET_VALUE" ]]; then
  echo "::error::Missing OAuth secret \$${SECRET_ENV}. Seed it from a local login (see /docs/cli-agents)."
  exit 1
fi

# Write without a trailing-newline surprise when the secret is raw JSON.
printf '%s' "$SECRET_VALUE" > "$TARGET_PATH"
chmod 600 "$TARGET_PATH"
echo "Seeded OAuth auth file at $TARGET_PATH from \$${SECRET_ENV}"

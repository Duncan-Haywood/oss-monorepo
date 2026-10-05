#!/usr/bin/env bash
set -euo pipefail

missing=()
for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID AUTH_SECRET ALLOWED_EMAIL; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required secrets: ${missing[*]}"
  echo "Add them in Cursor → Cloud Agents → Secrets for this environment."
  echo "Then restart the agent so secrets are injected."
  exit 1
fi

npm run deploy

echo "$AUTH_SECRET" | npx wrangler secret put AUTH_SECRET
# A secret rather than a wrangler.jsonc var, so the address stays out of the
# public repository. Without it the app lets nobody in.
echo "$ALLOWED_EMAIL" | npx wrangler secret put ALLOWED_EMAIL

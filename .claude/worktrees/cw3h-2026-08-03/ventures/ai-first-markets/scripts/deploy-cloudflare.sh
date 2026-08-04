#!/usr/bin/env bash
set -euo pipefail

missing=()
for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID AUTH_SECRET; do
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

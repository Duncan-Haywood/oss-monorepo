#!/usr/bin/env bash
# Starts PayApps for Playwright (playwright.config.ts `webServer`), fully offline:
#  - fresh local D1 and R2 in .wrangler/e2e on every run (the developer's .wrangler/state is never
#    touched); E2E_KEEP_STATE=1 keeps the data from the last run;
#  - schema from the committed D1 migrations, the same files production applies;
#  - FAKE_EXTERNALS=true: account mail goes to an in-memory fake; BILLING_PROVIDER stays "none".
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-5197}"
PERSIST=".wrangler/e2e"
export WRANGLER_SEND_METRICS=false

if [[ "${E2E_KEEP_STATE:-0}" != "1" ]]; then
  rm -rf "$PERSIST"
fi
mkdir -p "$PERSIST"

echo "[e2e] applying D1 migrations to $PERSIST"
pnpm exec wrangler d1 migrations apply DB --local --persist-to "$PERSIST" >/dev/null

echo "[e2e] starting vite dev on :$PORT"
exec pnpm exec vite dev --config test/e2e/vite.e2e.config.ts --port "$PORT" --strictPort

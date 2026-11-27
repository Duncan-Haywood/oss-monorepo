#!/usr/bin/env bash
# Starts Seller Books for Playwright (playwright.config.ts `webServer`), fully offline:
#  - fresh local D1 in .wrangler/e2e on every run (the developer's .wrangler/state is never touched);
#    E2E_KEEP_STATE=1 keeps the data from the last run;
#  - schema from the committed D1 migrations, the same files production applies;
#  - FAKE_EXTERNALS=true: the signed fake billing provider and an in-memory mail fake, no network.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-5196}"
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

#!/usr/bin/env bash
# Starts Job Shop Quote for Playwright (playwright.config.ts `webServer`), fully offline:
#  - fresh local D1/R2 in .wrangler/e2e on every run (the demo's .wrangler/demo and the developer's
#    .wrangler/state are never touched); E2E_KEEP_STATE=1 keeps the data from the last run;
#  - schema from the committed D1 migrations, the same files production applies;
#  - FAKE_EXTERNALS=true: rule-based FakeLlm extractor and text converter, no network, no API key.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-5198}"
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

#!/usr/bin/env bash
# Runs the Playwright e2e suite offline (fake LLM and converter, fresh local D1).
# Usage (from anywhere):
#   apps/jobshop-quote/scripts/e2e-run.sh                                  # all specs
#   apps/jobshop-quote/scripts/e2e-run.sh test/e2e/01-rfq-to-quote.spec.ts -g "won"
#   E2E_BASE_URL=http://localhost:5199 apps/jobshop-quote/scripts/e2e-run.sh   # against `pnpm demo`
#   E2E_SERVER_LOGS=1 ...                                                  # show the dev server's stdout
# Extra args go straight to `playwright test`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -x node_modules/.bin/playwright ]]; then
  echo "playwright not installed (run pnpm install in the repo root)" >&2
  exit 1
fi

# Use the preinstalled browsers when present; never download browsers from here.
if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" && -d /opt/pw-browsers ]]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
fi

exec pnpm exec playwright test --trace off --workers 1 "$@"

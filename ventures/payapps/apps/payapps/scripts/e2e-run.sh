#!/usr/bin/env bash
# Runs the Playwright e2e suite offline (mail to an in-memory fake, fresh local D1 and R2).
# Usage (from anywhere):
#   apps/payapps/scripts/e2e-run.sh                                  # all specs
#   apps/payapps/scripts/e2e-run.sh test/e2e/01-first-pay-app.spec.ts -g "PDF"
#   E2E_BASE_URL=http://localhost:5173 apps/payapps/scripts/e2e-run.sh   # against `pnpm dev` (FAKE_EXTERNALS=true)
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

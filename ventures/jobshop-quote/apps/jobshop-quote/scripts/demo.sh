#!/usr/bin/env bash
# Offline demo: applies D1 migrations to .wrangler/demo and starts the app on :${DEMO_PORT:-5199}.
# Fake LLM (rule-based extractor), no network, no API keys. Data persists in .wrangler/demo.
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
pnpm exec wrangler d1 migrations apply DB --local --persist-to .wrangler/demo >/dev/null
exec pnpm exec vite dev --config vite.demo.config.ts

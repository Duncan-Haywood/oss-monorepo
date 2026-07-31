#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
component="${1:-}"
install="${CI_INSTALL_DEPENDENCIES:-0}"

run_npm() {
  local directory="$1"
  shift
  (
    cd "$repo_root/$directory"
    if [[ "$install" == "1" ]] || [[ ! -d "node_modules" ]]; then
      npm ci --ignore-scripts --no-audit --fund=false
    fi
    "$@"
  )
}

case "$component" in
  pairwise)
    run_npm ventures/quick-pick-survey npx prisma generate
    run_npm ventures/quick-pick-survey npm run typecheck
    run_npm ventures/quick-pick-survey npm run lint
    run_npm ventures/quick-pick-survey npm test
    run_npm ventures/quick-pick-survey npm run build
    ;;
  ai-first-markets)
    run_npm ventures/ai-first-markets npm run typecheck
    run_npm ventures/ai-first-markets npm run lint
    run_npm ventures/ai-first-markets npm test
    run_npm ventures/ai-first-markets npm run build
    run_npm ventures/ai-first-markets npm run cf:build
    ;;
  local-site-studio)
    run_npm ventures/local-site-studio npm run lint
    run_npm ventures/local-site-studio npm test
    run_npm ventures/local-site-studio npm run build
    ;;
  print-atelier)
    run_npm ventures/print-atelier npm run lint
    run_npm ventures/print-atelier npm test
    run_npm ventures/print-atelier npm run build
    ;;
  retail-pilot-intel)
    (
      cd "$repo_root/ventures/retail-pilot-intel"
      if [[ "$install" == "1" ]] || [[ ! -d "node_modules" ]]; then
        corepack pnpm install --frozen-lockfile --ignore-scripts
      fi
      corepack pnpm run ci
    )
    ;;
  *)
    printf 'Usage: %s {pairwise|ai-first-markets|local-site-studio|print-atelier|retail-pilot-intel}\n' "$0" >&2
    exit 2
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

# Monorepo Unified Verification Runner & Dagger Entrypoint
# Runs CI self-testing, security scans, affected-path analysis, and venture verification.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Starting Monorepo Unified Verification & Dagger CI Suite ==="
echo "Repository Root: ${REPO_ROOT}"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

# 1. First, verify and test the CI infrastructure itself
if [ -f "${REPO_ROOT}/scripts/test-ci.sh" ]; then
  bash "${REPO_ROOT}/scripts/test-ci.sh"
fi

# 2. Invoke Dagger CI Engine (with fallback to host runner)
if [ -f "${REPO_ROOT}/platform/ci/src/pipeline.mjs" ]; then
  node "${REPO_ROOT}/platform/ci/src/pipeline.mjs" "$@"
else
  echo "🚨 Dagger CI engine file not found: platform/ci/src/pipeline.mjs"
  exit 1
fi

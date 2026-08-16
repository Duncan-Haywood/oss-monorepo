#!/usr/bin/env bash
set -euo pipefail

# Monorepo Unified Verification Runner & Dagger Entrypoint
# Runs CI self-testing, security scans, affected-path analysis, and venture verification.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export SECURITY_SCAN_ALLOW_OFFLINE="${SECURITY_SCAN_ALLOW_OFFLINE:-1}"
# No BASELINE_TRUST_ALLOW_OFFLINE / ALLOW_SWIFT_TOOLCHAIN_MISMATCH default here.
# Both were added on 2026-08-17 defaulted to 1, and an escape hatch defaulted on
# is not an escape hatch, it is the new behaviour. `baseline_trust.py` no longer
# reads either name (tests/test_baseline_trust_offline.py pins that), and the
# Swift host check fails closed rather than returning a pass it did not earn.

# Refresh local tracking ref to ensure baseline trust checks verify against remote
git fetch origin main >/dev/null 2>&1 || true

echo "=== Starting Monorepo Unified Verification & Dagger CI Suite ==="
echo "Repository Root: ${REPO_ROOT}"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

# 1. First, verify and test the CI infrastructure itself
# The `fi` below used to have no `else`, so renaming or deleting this file made
# every repository-wide gate it registers vanish while this script still exited
# 0 — the same fail-open the Dagger engine block beneath it already refuses.
if [ -f "${REPO_ROOT}/scripts/test-ci.sh" ]; then
  bash "${REPO_ROOT}/scripts/test-ci.sh"
else
  echo "🚨 CI self-test runner not found: scripts/test-ci.sh"
  echo "   Every repository-wide gate is registered there. Refusing to report"
  echo "   success for checks that did not execute."
  exit 1
fi

# 2. Invoke Dagger CI Engine (with fallback to host runner)
if [ -f "${REPO_ROOT}/platform/ci/src/pipeline.mjs" ]; then
  node "${REPO_ROOT}/platform/ci/src/pipeline.mjs" "$@"
else
  echo "🚨 Dagger CI engine file not found: platform/ci/src/pipeline.mjs"
  exit 1
fi

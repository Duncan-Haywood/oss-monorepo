#!/usr/bin/env bash
set -euo pipefail

# Monorepo CI Pipeline Self-Test Suite
# Tests and verifies the CI/CD infrastructure, scripts, and policy engines.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Starting CI/CD Infrastructure Self-Test Suite ==="
echo "Repository Root: ${REPO_ROOT}"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

FAILURES=0

run_ci_test() {
  local name="$1"
  shift
  echo ""
  echo "------------------------------------------------------------"
  echo "▶ Running CI Test: ${name}"
  echo "------------------------------------------------------------"
  if "$@"; then
    echo "✔ PASSED: ${name}"
  else
    echo "✖ FAILED: ${name}"
    FAILURES=$((FAILURES + 1))
  fi
}

# 1. Pairwise Unit & Component Tests
run_ci_test "Pairwise (Quick Pick Survey) Unit Suite" npm --prefix "${REPO_ROOT}/ventures/quick-pick-survey" test

# 2. Dagger CI Engine Unit Tests
run_ci_test "Dagger CI Engine Unit Tests" node --test "${REPO_ROOT}/platform/ci/test/pipeline.test.mjs"

# 3. Security Policy Scanner Unit Tests
run_ci_test "Security Policy Scanner Logic Unit Tests" bash "${REPO_ROOT}/scripts/security/test-scan-repository.sh"
run_ci_test "Repository Engineering Policy Contract" bash "${REPO_ROOT}/scripts/ci/test-engineering-policy.sh"

# 4. Portfolio Router & Ledger Verification Suite
run_ci_test "Portfolio Router & Allocation Unit Suite" python3 "${REPO_ROOT}/tests/test_portfolio_router.py"
run_ci_test "Monorepo Python Test Suite (pytest)" pytest
run_ci_test "Portfolio Router Allocation Report Generation" python3 "${REPO_ROOT}/portfolio/router/router.py"

# 4. Shell Script Static Analysis (if shellcheck installed)
if command -v shellcheck >/dev/null 2>&1; then
  run_ci_test "Shell Script Static Analysis (ShellCheck)" shellcheck "${REPO_ROOT}/scripts/"*.sh "${REPO_ROOT}/scripts/security/"*.sh
else
  echo "ℹ ShellCheck not installed; skipping shell script linting."
fi

# 5. GitHub/Gitea Actions Workflow Validation (if actionlint installed)
if command -v actionlint >/dev/null 2>&1; then
  run_ci_test "Workflow Linting" actionlint .gitea/workflows/*.yml
else
  echo "ℹ actionlint not installed; skipping workflow linting."
fi

echo ""
echo "============================================================"
if [ ${FAILURES} -eq 0 ]; then
  echo "🎉 ALL CI INFRASTRUCTURE TESTS PASSED SUCCESSFULLY!"
  echo "============================================================"
  exit 0
else
  echo "🚨 CI INFRASTRUCTURE TESTS FAILED WITH ${FAILURES} ERROR(S)."
  echo "============================================================"
  exit 1
fi

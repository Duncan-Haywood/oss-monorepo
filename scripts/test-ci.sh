#!/usr/bin/env bash
set -euo pipefail

# Monorepo CI Pipeline Self-Test Suite
# Tests and verifies the CI/CD infrastructure, scripts, and policy engines.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Every check below must resolve against the repository, not the caller's
# working directory. Pre-push hooks and CI runners invoke this from anywhere.
cd "${REPO_ROOT}"
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
# Every test file under platform/ci/test, not a named one. This line used to
# name `pipeline.test.mjs` alone, so `verify-contract.test.mjs` — the gate that
# fails closed when VENTURE.yaml, verify-component.sh and the catalog drift
# apart — was executed by nothing at all. A contract test no pipeline runs is
# the same failure it exists to catch, one level up.
run_ci_test "Dagger CI Engine Unit Tests" node --test "${REPO_ROOT}/platform/ci/test/"*.test.mjs

# 3. Security Policy Scanner Unit Tests
run_ci_test "Security Policy Scanner Logic Unit Tests" bash "${REPO_ROOT}/scripts/security/test-scan-repository.sh"
run_ci_test "Repository Engineering Policy Contract" bash "${REPO_ROOT}/scripts/ci/test-engineering-policy.sh"
run_ci_test "Vulnerability Roadmap Scanner Contract Tests" bash "${REPO_ROOT}/scripts/security/test-security-scan.sh"

# 4. Portfolio Router & Ledger Verification Suite
run_ci_test "Portfolio Router & Allocation Unit Suite" python3 "${REPO_ROOT}/tests/test_portfolio_router.py"
run_ci_test "Monorepo Python Test Suite (pytest)" pytest
run_ci_test "Portfolio Router Allocation Report Generation" python3 "${REPO_ROOT}/portfolio/router/router.py"
# Gates VENTURE.yaml drift against the ledger. --strict fails on warnings too,
# which is the point: every warning this reports is a venture claiming more
# allocation credit than the ledger supports, and the router spends real budget
# off those fields. The backlog that kept this advisory is now cleared, so a new
# warning means new drift, not inherited debt.
run_ci_test "Venture Contract Validation" python3 "${REPO_ROOT}/portfolio/router/validate_ventures.py" --strict
# The other half of the same join: the ledger those contracts are checked
# against. router.py sums `agent_spend_usd` into the explore-grant decay, so a
# venture name matching no VENTURE.yaml, a duplicate row, or an absent spend
# figure all move budget — those are errors and this gate fails on them.
# Deliberately not --strict, unlike the contract validator above. Its backlog
# was cleared before it was tightened; this one still carries 2026-07, whose
# spend is $127.26 divided seven ways rather than seven measurements. A closed
# month cannot be reconstructed and the ledger README forbids rewriting it, so
# --strict here would be a gate nobody can ever turn green. Meter spend per
# venture for a full month, then add --strict.
run_ci_test "Portfolio Ledger Validation" python3 "${REPO_ROOT}/portfolio/router/validate_ledger.py"
# Every suppression needs an owner, reason, issue and expiry — four documents
# say so and nothing enforced it. Fails on an unregistered suppression, an
# expired grant, and a register that drifted above the code it covers.
# `tests/test_audit_exceptions.py` runs the same audit under pytest, so this
# entry is the named gate rather than the only enforcement.
run_ci_test "Exception Register Audit" python3 "${REPO_ROOT}/scripts/ci/audit_exceptions.py"
# Coverage was a sentence in ENGINEERING-PRINCIPLES.md and a grep asserting the
# sentence was still there; deleting every test left it green. This measures
# each declared component and compares both ways: below baseline means a test
# was removed, above it means the baseline is stale and nobody raised it.
# `tests/test_coverage_ratchet.py` runs the same audit under pytest, so this
# entry is the named gate rather than the only enforcement.
run_ci_test "Coverage Baseline Ratchet" python3 "${REPO_ROOT}/scripts/ci/coverage_ratchet.py"
# Three ventures grew a route auth-posture contract by hand and the roadmap
# called them "three hand-written files, not a control". Measured 2026-08-01 it
# was worse: two of the three are executed by no gate at all, and one of those
# fails outright on a clean checkout — it declares a route that was never
# committed. A test nothing runs cannot fail, so it controls nothing. This
# checks all three things: every venture serving HTTP routes declares a
# contract, that contract is reachable by a real gate, and its handler count
# matches the measured surface both ways. The count is what catches a new
# unguarded endpoint nobody declared.
run_ci_test "Route Auth-Posture Contract Coverage" python3 "${REPO_ROOT}/scripts/ci/route_posture_contract.py"

# Linter gates below are host-tool dependent. Absence used to print a notice
# and touch nothing — neither branch incremented FAILURES, so "not installed"
# and "passed" were the same exit code. That is a reasonable convenience on a
# developer laptop and a hole in CI, where `.gitea/workflows/ci-cd.yml` installs
# both linters explicitly: a missing tool there means the install step did not
# run, and the gate must not report success for a check that never executed.
have_linter() {
  local tool="$1"
  if command -v "${tool}" >/dev/null 2>&1; then
    return 0
  fi
  if [ -n "${CI:-}" ]; then
    echo ""
    echo "✖ FAILED: ${tool} is not installed on this CI runner."
    echo "  .gitea/workflows/ci-cd.yml installs it; its absence means that"
    echo "  install step did not run. Not skipping — the check never executed."
    FAILURES=$((FAILURES + 1))
  else
    echo "ℹ ${tool} not installed; skipping locally. CI installs it and fails without it."
  fi
  return 1
}

# 5. Shell Script Static Analysis
if have_linter shellcheck; then
  # scripts/ci/ was excluded, which left `verify-component.sh` unlinted — the
  # file docs/CI-CD-ARCHITECTURE.md calls the shared, fail-closed local/CI
  # contract, and the one every venture workflow shells into.
  run_ci_test "Shell Script Static Analysis (ShellCheck)" shellcheck "${REPO_ROOT}/scripts/"*.sh "${REPO_ROOT}/scripts/ci/"*.sh "${REPO_ROOT}/scripts/security/"*.sh
fi

# 6. GitHub/Gitea Actions Workflow Validation
if have_linter actionlint; then
  run_ci_test "Workflow Linting" actionlint "${REPO_ROOT}/.gitea/workflows/"*.yml
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

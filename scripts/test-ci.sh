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

# Refuse to run on a Node major other than the pinned one. Putting
# /usr/local/bin ahead on PATH — the usual way to reach this host's python3.11 —
# also selects the node v18.16.0 in that directory, ahead of the real Node, and
# that turns three gates below red for reasons unrelated to the tree: Pairwise
# dies on a node:util export vitest needs, and the coverage ratchet reports
# coverage-command-failed for print-atelier and platform-ci. Each failure names
# a component rather than the interpreter, so the natural reading is a broken
# venture, and the diagnosis is paid for again by every person who runs this
# next. Stopping here costs one line; not stopping costs an hour.
if [ -f "${REPO_ROOT}/.nvmrc" ] && command -v node >/dev/null 2>&1; then
  EXPECTED_NODE_MAJOR="$(tr -d '[:space:]' < "${REPO_ROOT}/.nvmrc" | sed 's/^v//' | cut -d. -f1)"
  ACTUAL_NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if [ -n "${EXPECTED_NODE_MAJOR}" ] && [ "${ACTUAL_NODE_MAJOR}" != "${EXPECTED_NODE_MAJOR}" ]; then
    if [ "${ALLOW_NODE_VERSION_MISMATCH:-0}" -eq 1 ]; then
      echo "⚠ Node $(node --version) is not the pinned major ${EXPECTED_NODE_MAJOR};" \
        "ALLOW_NODE_VERSION_MISMATCH=1 — failures below may be version artifacts."
    else
      echo ""
      echo "✖ Node $(node --version) does not match the pinned major ${EXPECTED_NODE_MAJOR} (.nvmrc)."
      echo "  The gates below only pass on Node ${EXPECTED_NODE_MAJOR}, which is what"
      echo "  .gitea/workflows/* install. Running them here would report component"
      echo "  failures that are artifacts of the interpreter, not of the tree."
      echo ""
      echo "  Fix:  nvm use          (or install Node ${EXPECTED_NODE_MAJOR})"
      echo "  Skip: ALLOW_NODE_VERSION_MISMATCH=1 bash scripts/test-ci.sh"
      exit 1
    fi
  fi
fi

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
run_ci_test "Vulnerability Roadmap Scanner Contract Tests" bash "${REPO_ROOT}/scripts/security/test-security-scan.sh"
run_ci_test "Repository Engineering Policy Contract" bash "${REPO_ROOT}/scripts/ci/test-engineering-policy.sh"
# The contract test for the per-venture Gitea gate script. It asserts that the
# script fails closed on unknown components and never swallows a gate failure,
# and until now nothing invoked it.
run_ci_test "Component Verification Contract" bash "${REPO_ROOT}/scripts/ci/test-verify-component.sh"
run_ci_test "Vulnerability Roadmap Scanner Contract Tests" bash "${REPO_ROOT}/scripts/security/test-security-scan.sh"
# The contract test for scripts/ci/verify-component.sh — the shared fail-closed
# gate every venture workflow shells into. It asserts that an unknown component
# exits non-zero, that `set -euo pipefail` is present, and that no `|| true`
# sits on an install or quality gate. Until now it was named by no runner and no
# workflow, so the file had been written, reviewed and never once executed.
run_ci_test "Component Verification Contract Tests" bash "${REPO_ROOT}/scripts/ci/test-verify-component.sh"

# 4. Portfolio Router & Ledger Verification Suite
run_ci_test "Portfolio Router & Allocation Unit Suite" python3 "${REPO_ROOT}/tests/test_portfolio_router.py"
run_ci_test "Monorepo Python Test Suite (pytest)" pytest
run_ci_test "Portfolio Router Allocation Report Generation" python3 "${REPO_ROOT}/portfolio/router/router.py"
# Gates VENTURE.yaml drift against the ledger. --strict fails on warnings too,
# which is the point: every warning this reports is a venture claiming more
# allocation credit than the ledger supports, and the router spends real budget
# off those fields. The backlog that kept this advisory is now cleared, so a new
# warning means new drift, not inherited debt.
# Also audits kill criteria. `budget.protected` demands them because "without
# kill criteria there is no condition under which it stops", but until
# 2026-08-03 a line of prose satisfied that while allocate.py read the criteria
# into an unused variable. This now fails on a criterion nothing can evaluate
# and that nobody has parked in portfolio/kill-criteria-register.yaml, on a
# register that expired or drifted from what it covers, and on a typo'd metric.
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
# deploy-services.yml already had a step named "Reject mutable image tags". It
# rendered the chart with `--set image.tag=ci-$GITHUB_SHA` and grepped that
# render for `latest` — searching for a string it had just made impossible, over
# manifests it never opened. This reads the effective reference in
# platform/k8s, after each directory's Kustomize overlay, so what is judged is
# what Argo CD renders. `tests/test_image_tags.py` runs the same audit under
# pytest, so this entry is the named gate rather than the only enforcement.
run_ci_test "Container Image Tag Audit" python3 "${REPO_ROOT}/scripts/ci/image_tags.py"
# Kill criteria are the portfolio's only declared spending brake, and
# `portfolio/router/allocate.py` read them into a variable it never used. The
# two rules that did run were hardcoded to stages no venture occupies, so
# `killed_count` was zero by construction while the allocator moved $199.98 of a
# $500 pool against zero recorded revenue. This counts the ventures with no
# criterion the allocator can evaluate and fails when that grows.
# `tests/test_kill_criteria_ratchet.py` runs the same audit under pytest, so this
# entry is the named gate rather than the only enforcement.
run_ci_test "Kill-Criteria Stopping Rule Ratchet" python3 "${REPO_ROOT}/scripts/ci/kill_criteria_ratchet.py"

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

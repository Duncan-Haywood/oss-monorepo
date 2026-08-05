#!/usr/bin/env bash
set -euo pipefail

# Monorepo CI Pipeline Self-Test Suite
# Tests and verifies the CI/CD infrastructure, scripts, and policy engines.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Ensure git commands don't crash when user's home gitconfig is restricted by sandbox
if [ -z "${GIT_CONFIG_GLOBAL:-}" ] && [ -f "${HOME:-}/.gitconfig" ] && ! [ -r "${HOME:-}/.gitconfig" ]; then
  export GIT_CONFIG_GLOBAL=/dev/null
fi
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
# The contract test for scripts/ci/verify-component.sh — the shared fail-closed
# gate every venture workflow shells into. It asserts that an unknown component
# exits non-zero, that `set -euo pipefail` is present, and that no `|| true`
# sits on an install or quality gate. Until now it was named by no runner and no
# workflow, so the file had been written, reviewed and never once executed.
#
# It was registered twice for a while — once as "Component Verification
# Contract" and once as "Component Verification Contract Tests" — and so was the
# scanner contract above, under the same name both times. Two branches each
# added the entry a gate was missing and the 2026-08-04c merge kept both, so the
# runner announced 24 gates over 22 distinct commands. A duplicate reads as
# breadth in the PASSED list while only costing time, and the second name made
# it look like two different controls.
# `platform/ci/test/gate-wiring.test.mjs` now fails on a repeated command.
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
# into an unused variable. Three findings, and only these three:
# `protected-without-kill-criteria` (protected budget, no criteria declared),
# `dominated-kill-criterion` (a criterion that can never be the one that fires,
# because another has the same conditions and reaches them sooner), and
# `kill-criterion-triggered` (a criterion that has actually fired).
# It does NOT count criteria that cannot be evaluated — that is the separate
# "Kill-Criteria Stopping Rule Ratchet" gate below, against
# platform/kill-criteria-baseline.yaml. An earlier version of this comment
# described a portfolio/kill-criteria-register.yaml that does not exist on this
# branch; a gate credited with checks it does not perform is the drift the rest
# of this file exists to catch, so keep this list matched to the `code=` values
# in portfolio/router/validate_ventures.py.
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
# Each ratchet above bounds its declared budget with a constant one level up,
# and every one of those constants carries a comment saying that raising it
# "requires changing this file under review, which is the point." Nothing
# reviewed it: the release-lag caps landed 2026-08-02 and were edited upward
# the next day, 150 -> 170 and 40 -> 45, in the same working tree that raised
# the YAML they bound. This takes each cap's floor from git history rather than
# from another declared number, and refuses any value above the lowest that cap
# has ever held. `tests/test_cap_ratchet.py` runs the same audit under pytest,
# so this entry is the named gate rather than the only enforcement.
run_ci_test "Cap Ratchet" python3 "${REPO_ROOT}/scripts/ci/cap_ratchet.py"
# The ratchet above counts ventures that have no brake. This one asks what
# happens when a brake actually fires, which until 2026-08-03 was nothing: the
# evaluation lived in `allocate.py`, which no pipeline runs, while `router.py` —
# the engine two lines above this one, and the author of the ranked queue a
# session reads to pick work — carried `kill_criteria` in a dataclass field and
# never read it. router.py now withholds a triggered venture's allocation; this
# gate requires a human to have decided what to do about it, and fails on a
# decision that expired, that covers a criterion no longer firing, or that says
# wind-down while the venture's stage says otherwise.
# `tests/test_stopping_rule_review.py` runs the same audit under pytest, so this
# entry is the named gate rather than the only enforcement.
run_ci_test "Stopping-Rule Decision Review" python3 "${REPO_ROOT}/scripts/ci/stopping_rule_review.py"
# `scripts/ci/release_lag.py` says how much work has not shipped. It cannot say
# whether that work is one release candidate or forty, and the difference is
# the entire cost of shipping it: 42 branches ahead of origin/main is either
# one reviewed push or 42 reconciliations, and release lag reports the same
# number for both. Measured 2026-08-04, it was one — every branch in the
# repository was an ancestor of `agent/integration-full-2026-08-03` — and the
# only reason nobody knew is that the measurement was made by hand each time
# (docs/INTEGRATION-REPORT-2026-08-03.md is it written longhand, stale within a
# day). Work that looks like weeks of integration does not get pushed, so the
# missing measurement was itself a cause of the delay.
# This runs as a named gate because that one line is what a human reads before
# deciding to ship; `tests/test_integration_debt.py` runs the same audit under
# pytest, so this entry is not the only enforcement.
run_ci_test "Integration Debt Ratchet" python3 "${REPO_ROOT}/scripts/ci/integration_debt.py"
# `release_lag.py` above measures local branches against `origin/main` and
# reports that nothing in the gap is live. It never asked whether `origin/main`
# is live either, and on 2026-08-05 it was not: that gate failed at one commit
# over a budget of zero — a repository one push from fully shipped — while
# `origin/gitops-production` recorded production as `cd67f022` from 2026-07-31,
# 436 commits back. In those 436 was the commit that removed a `$9 / month`
# price and a `Most Popular` badge from a tier with no payment path, so the only
# venture with live customers was still advertising both. This measures the
# other half of the distance from a commit to a customer, and counts the public
# hostnames for which no revision is recorded at all.
# `tests/test_deployment_lag.py` runs the same audit under pytest, so this entry
# is the named gate rather than the only enforcement.
run_ci_test "Deployment Lag Ratchet" python3 "${REPO_ROOT}/scripts/ci/deployment_lag.py"
# Every venture has Kubernetes manifests; most name an image nothing in this
# repository can build. Six of the eight organisation images under
# `platform/k8s/apps` had no producer on 2026-08-04 — complete Deployments
# pointed at tags that would never exist, including local-site-studio, which
# holds the most finished commerce code in the monorepo. This counts the
# deployments that cannot be released, and the releases pinned to a mutable tag,
# and fails when either grows. `tests/test_image_release_path.py` runs the same
# audit under pytest, so this entry is the named gate rather than the only
# enforcement.
run_ci_test "Image Release Path Ratchet" python3 "${REPO_ROOT}/scripts/ci/image_release_path.py"
# A criss-cross merge can concatenate two versions of one module, and nothing
# else here would notice. On 2026-08-04 `portfolio/router/router.py` carried a
# 124-line duplicate tail — a second `main`, `find_repo_root`, `load_ventures`,
# `load_ledger`, `calculate_score` and `route_portfolio` — sitting after
# `if __name__ == "__main__": main()`. It parsed, it imported, and 1139 pytest
# tests were green, because Python binds the later definition. The guard between
# the copies made it a live divergence rather than dead code: run as a script
# the file called the *first* `main`, while every test imported the second, and
# the two returned different fields. Every other gate here asks whether the code
# works, and for this defect the answer is yes.
# `tests/test_duplicate_definitions.py` runs the same scan under pytest, so this
# entry is the named gate rather than the only enforcement.
run_ci_test "Duplicate Definition Scan" python3 "${REPO_ROOT}/scripts/ci/duplicate_definitions.py"
# A symlink is committed as a blob holding its target, so a link to
# /Users/duncan/... travels in the history as that literal path: correct on one
# laptop, broken in every clone and on every runner. One reached main on
# 2026-08-04 — `ventures/real-estate-agent-photo-app/pipeline/node_modules` —
# and no other control could see it, because to all of them it is an ordinary
# tracked file. It got in because `.gitignore` said `node_modules/`, and a
# trailing slash matches directories only. This runs as a named gate because
# the failure it prevents is a clone that cannot build for reasons that point
# nowhere near the link; `tests/test_tracked_symlinks.py` runs the same audit
# under pytest, so this entry is the named gate rather than the only
# enforcement.
run_ci_test "Tracked Symlink Contract" python3 "${REPO_ROOT}/scripts/ci/tracked_symlinks.py"

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
  # `.gitea/workflows/` was this line's whole input, so the 15 tracked files
  # under `ventures/*/.github/workflows/` were linted by nothing. That is the
  # layer docs/CONTROL-AUDIT-2026-08-04.md finding 2 left open when the four
  # .mjs workflow controls moved to `git ls-files`; running actionlint over
  # them by hand on the first pass found two real syntax errors, both fixed in
  # the same commit as this change.
  #
  # Enumerate from the index rather than a glob, for the reason
  # `gate-collection.test.mjs` gives: a glob is resolved against a laptop's
  # filesystem, and an untracked workflow that lints clean here is not in the
  # clone CI checks out. Collecting nothing is a failure, not a pass — an
  # actionlint invocation with no file arguments exits 0.
  workflow_files=()
  while IFS= read -r workflow_file; do
    workflow_files+=("${REPO_ROOT}/${workflow_file}")
  done < <(git -C "${REPO_ROOT}" ls-files -- \
    '.gitea/workflows/*.yml' '.gitea/workflows/*.yaml' \
    'ventures/*/.github/workflows/*.yml' 'ventures/*/.github/workflows/*.yaml')

  if [ ${#workflow_files[@]} -eq 0 ]; then
    echo ""
    echo "✖ FAILED: Workflow Linting collected no files."
    echo "  Both workflow roots resolved empty against \`git ls-files\`. Either"
    echo "  every workflow was deleted or renamed out from under this gate, or"
    echo "  the files are untracked. actionlint exits 0 on no arguments, so"
    echo "  this fails closed rather than reporting a lint that never ran."
    FAILURES=$((FAILURES + 1))
  else
    run_ci_test "Workflow Linting" actionlint "${workflow_files[@]}"
  fi
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

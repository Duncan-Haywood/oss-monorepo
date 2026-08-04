# Integration report, 2026-08-04 (second pass)

Branch: `agent/integration-2026-08-04b`, built on `agent/integration-2026-08-04`.
127 commits ahead of `main`. **Nothing has been pushed to `origin` and nothing
has been deployed.**

Five of the eight branches the previous report listed as outstanding are merged.
Two defects were found that neither branch could have seen alone, and one of
them was in the tree the previous integration had already declared green.

## Verification

| Gate | Result |
|:---|:---|
| `pytest portfolio/ tests/` | **528 passed, 0 failed** |
| `platform/ci` contract suite | **101 passed, 0 failed** (was 95) |
| `scripts/security/scan-repository.sh` | PASS |
| `scripts/ci/coverage_ratchet.py` | PASS, both components at baseline |
| `scripts/ci/cap_ratchet.py` | **FAIL, 2 findings — correct, see below** |
| `local-site-studio` | typecheck clean, 1256 tests / 130 files |
| `quick-pick-survey` posture contract | 14 tests |
| `ai-engineering-academy` verify | 10 pages built, 57 classes styled, suites pass |

The previous report's single pytest failure was `component-dependencies-missing`
for print-atelier. That was the environment, exactly as the gate said: with the
venture's dependencies installed the coverage ratchet measures
`print-atelier 91.83/87.53/79.81` over 54 files and `platform-ci 69.86/85.29/82.58`
over 2 files and 1095 lines, both matching their declared baselines and bases.
**pytest is 528/0 for the first time.**

`cap_ratchet.py` fails on `max_branches_ahead` 32 -> 35 and
`max_unshipped_commits` 125 -> 135. Both are landed raises of a debt ceiling and
the only edit that clears either is shipping, then re-declaring downward. It
stays red.

## The two defects the integration found

### 1. Seven unresolved merge markers in the venture with the Stripe checkout

`ventures/local-site-studio/src/app/layout.tsx` and `page.tsx` — the root layout
and the homepage — carried committed conflict markers on
`agent/integration-2026-08-04`. The venture did not build. The two files a buyer
sees first were not valid TypeScript.

The venture's own suite passed 1256 tests against that tree, because no test
imports either file.

**Why nothing caught it is the part worth keeping.**
`scripts/security/scan-repository.sh` detects an unresolved merge marker and
exits 1 — verified against the broken tree — and it is wired into
`.gitea/workflows/security.yml`. But that workflow runs on a push to `origin`,
and nothing has been pushed for weeks, so the only check that would have seen
this ran nowhere. Meanwhile `scripts/test-ci.sh`, the entrypoint an agent
actually runs, registered only `test-scan-repository.sh` — the scanner's *unit
tests*. Those passed. A scanner whose unit tests pass tells you the scanner is
correct; it tells you nothing about the repository.

The scan itself is now gate 3 in `scripts/test-ci.sh` beside its tests.

The class is one past "a gate that cannot fail": a gate that is correct, wired,
and fail-closed, and still never executes against the tree, because the only
path that runs it is a path this fleet never takes.

### 2. Five debt ceilings that nothing watched

`ci/cap-ratchet` arrived watching fourteen numbers and carrying a contract test
that refuses any module-level `MAX_*` in `scripts/ci/` nothing watches. Against
its own branch that test passed. Against the integrated tree it named five
ceilings that had landed on branches the cap ratchet never saw:
`coverage_ratchet.MAX_BASIS_DRIFT_PERCENT`,
`stopping_rule_review.MAX_CONTINUE_OVERRIDES` and `MAX_REVIEW_DAYS`, and
`MAX_EXPIRY_DAYS` in both `image_tags.py` and `sast_scan.py`. All five bound
debt. Registered; 19 caps watched.

A cap ratchet is only as good as its register, and a fleet of parallel branches
grows ceilings faster than any one branch can see them.

## Merged

| Branch | Resolution |
|:---|:---|
| `agent/ledger-continuity-2026-08-03` | both sides' defect bullets kept; continuity + mirror checks now coexist |
| `ci/cap-ratchet` | both gates kept; five unwatched ceilings registered |
| `agent/continue-work-4-2026-08-02` | base's academy fix kept; usage-into-waitlist ported |
| `agent/profit-lever-2026-08-02` | duplicate control deleted, pinning sweep kept, five exemptions rejected |
| `agent/academy-test-script-2026-08-03` | fully subsumed; contributes no files |
| `agent/release-lag-signal-2026-08-02` | base's implementation kept; doc + scope limit ported |

Plus one branch's work landed independently of its parent:
`ventures/quick-pick-survey/src/lib/routeAuthPosture.test.ts` from
`agent/route-posture-repo-gate`, with the proxy-premise pin and the tightened
floor from `agent/route-posture-repo-control`. That closes the register's last
and largest gap — 32 handlers on the only venture serving production traffic.

## Four duplicates, and what decided each

Every branch merged this pass was a duplicate of something already in the tree.
That is now the dominant shape of work in this repository and the selection rule
was the same each time: **keep the one other controls already depend on.**

* **Supply chain.** Kept `dependency-audit-coverage.test.mjs` over
  `workflow-supply-chain.test.mjs` — it enumerates through `git ls-files`, handles
  `yarn.lock`, and carries five checks the other lacks. The loser's action-pinning
  sweep had no counterpart anywhere and survives as
  `platform/ci/test/workflow-action-pinning.test.mjs`.
* **Release lag.** Kept the `release-lag-budget.yaml` implementation because
  `cap_ratchet.py` watches four constants inside it; replacing it would have
  silently emptied six of the ratchet's nineteen watches.
* **Academy claims.** Kept the base's, which extracts the checkpoint grader into
  a module the page inlines and drives the page's own script in a `node:vm`.
* **Coverage baseline.** Kept the base's figures, re-measured live before
  choosing.

### The policy disagreement worth naming

`agent/profit-lever-2026-08-02` left five vulnerable lockfiles out of
`security.yml`'s matrix as exemptions expiring 2026-11-01, so the job would stay
green. All ten stay in and the failures show. **Two of the five reasons were
factually wrong**: `local-site-studio`'s cited a semver-major Next 16 upgrade
when it was already on 16.2.9 and the fix was the 16.2.12 patch since taken;
`photo-editing/docs-site`'s described two of that package's eighteen findings,
mischaracterised both, and omitted its two CRITICALs.

Both had the correct register shape — owner, issue, reason, expiry, count. That
is the finding: **nothing mechanical separates an exception written because the
work is scheduled from one written because the gate was red.** Reading the
stated reasons against the roadmap they cite is what found it, and no gate does
that.

## Not merged, and the decision each still needs

`agent/route-posture-repo-gate` and `agent/route-posture-repo-control` both
carry a third implementation of a repo-level route-posture control. Neither
knows the base's `route-auth-posture-coverage.test.mjs` exists. **The venture
contract was taken from them and the control fight is untouched.**

Analysed in full; the recommendation, so it is not re-derived:

* **Keep the base's control.** Its registry counts are the only ones accurate
  against this tree; it is the only one of the three with a dated, owned, *sized*
  exception mechanism (`repo-gate` has none at all); and it is the only one that
  models shell quoting, which is what puts `repo-gate` in the red on contact —
  the base quoted `ai-first-markets`' test glob and `repo-gate`'s collector reads
  the quote characters as literal.
* **Port from `repo-gate`:** the repo-wide handler-accounting check (its lines
  232–251 with helpers `routeHandlers`, `normalize`, `declaredIn`) — verified to
  report 0 unaccounted handlers across all five ventures on this tree — and its
  matcher self-tests, since the base's `collects()`/`globToRegExp()` trio is its
  most failure-prone code and is currently untested.
* **Port from `repo-control`:** the `test-ci.sh`-gate execution proof, which
  verifies a named shell gate actually runs the venture's suite rather than that
  a catalog entry exists; and its security finding, **renumbered SEC-028** — it
  is filed as SEC-021, which this tree already uses for the homepage container
  finding, and four handler justifications in the production venture's contract
  cite it.
* **Discard** `platform/route-posture-registry.yaml`,
  `scripts/ci/route_posture_contract.py` and its tests — a fourth register to
  keep in sync, whose counts are already stale (it declares `ai-first-markets`
  at 2 files / 3 handlers; this tree serves 3 / 4).

## What a human still has to decide

* **Nothing here has shipped, and this is now the largest single fact about the
  repository.** `origin/main` is 68 commits behind local `main`, which this
  branch is 127 ahead of. `release_lag.py` reports PASS here and **that number
  should not be believed**: it takes `origin/main` as what production runs, and
  this integration ran in a clone whose `origin` is the working repository, so
  it measured 124 commits against a ref itself 68 behind production. The true
  figure is roughly 192 against a budget of 135. A clone pointed at a
  non-production remote turns that gate green by construction.
* **print-atelier's `$150` stop-loss threshold is still unratified.** Set by an
  agent, not the portfolio owner, and still the only stopping rule that can fire.
* **Ten of eleven ventures still have no measurable stopping rule.**
* **46 of 47 dependency advisories remain unfixed**, and `security.yml` will be
  red on roughly six of ten matrix cells by design. Two of the three
  `real-estate-agent-photo-app` packages holding 24 of them have no test script,
  so the missing suite is the blocking work rather than the bump.
* `ledger_rows_by_venture` still swallows a `yaml.YAMLError`. Both gates parse
  every ledger file up front and fail on one that does not load; `allocate.py`
  and `router.py` do not.

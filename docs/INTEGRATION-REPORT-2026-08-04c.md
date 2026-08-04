# Integration report, 2026-08-04 (third pass — convergence)

Branch: `agent/integration-2026-08-04c`, built on
`agent/continue-work-2026-08-04b` with `agent/integration-2026-08-04b` merged
into it. 165 commits ahead of `main`. **Nothing has been pushed to `origin` and
nothing has been deployed.**

This pass is different from the two before it. Those merged outstanding feature
branches; this one merges the *integrations themselves*. Two branches had each
been declared the release candidate, and each had resolved the same duplicate —
`portfolio/router/kill_criteria.py` — in the opposite direction, both with a
written reason and both green in isolation.

`scripts/ci/integration_debt.py` now reports **48 refs ahead of `origin/main`,
one independent tip**. Every branch in the repository is an ancestor of this
one. Shipping is one reviewed push.

## Verification

Node 22.22.3 (`.nvmrc` major), with `quick-pick-survey` and `print-atelier`
dependencies installed.

| Gate | Result |
|:---|:---|
| `scripts/test-ci.sh` | **22 of 23 gates pass** |
| `pytest` (whole repo) | **1139 passed, 1 failed** — the failure is release lag |
| `platform/ci` contract suite | **110 passed, 0 failed** (was 101) |
| `portfolio/` + stopping-rule suites | 262 passed, 0 failed |
| `scripts/ci/coverage_ratchet.py` | PASS — `print-atelier 91.83/87.53/79.81`, `platform-ci 69.86/85.29/82.58` |
| `scripts/ci/cap_ratchet.py` | PASS, 27 caps watched, none twice |
| `scripts/ci/integration_debt.py` | PASS, 1 tip |
| `quick-pick-survey` posture contract | 14 tests, handler floor raised 28 -> 32 |
| `scripts/ci/release_lag.py` | **FAIL — correct, and the only failure** |

Release lag is red because 165 commits are not in `origin/main` against a
declared budget of 125. The only edit that clears it is shipping, then
re-declaring the budget downward. It was not widened.

## Which engine survived, and why the recorded reason had expired

`agent/continue-work-2026-08-04b` kept main's `comparator`/`threshold` engine.
Its stated reason (`fbb8bd1`) was that main's carried the gate —
`kill_criteria_ratchet.py`, which holds the number of ventures with no evaluable
stopping rule — and that "an engine with a gate behind it beats a richer engine
with none."

That reason was true when written and false by the time both branches existed.
`6aedb43`, on the other branch, had already retargeted the ratchet onto the
`op`/`value` engine, so the gate survives either way. With the tie-breaker gone
the richer engine wins on the merits it always had:

- `days_since:<anchor>`, the clock every "60 days post-launch" criterion in the
  portfolio needs and none of them had. The other branch dropped the template's
  `anchors:` block for exactly this reason, and recorded it as open.
- the per-venture register with owner, missing signal and a 180-day expiry, so
  "this venture has no working brake" is a dated admission rather than prose.
- `None` for an unrecorded metric rather than `0.0`. main's version folded
  revenue into a float starting at zero and skipped months recording no
  `mrr_end`, so a venture nobody had measured read as one with zero revenue and
  its stop-loss fired on the absence of data.

`validate_ventures.validate_kill_criteria` was the one consumer git auto-merged
onto the discarded API. It failed on import, which is the good case.

## Three defects, none of which git reported as a conflict

### 1. Two files silently dropped through an 11-way criss-cross

`portfolio/kill-criteria-register.yaml` and `portfolio/router/test_kill_criteria.py`
had been deleted by `fbb8bd1` when the other branch discarded this engine. The
merge has eleven merge bases; the recursive resolution kept that deletion while
keeping the engine that requires them, and printed nothing.

The register's absence is a blocking finding, so the portfolio suite caught it
one step later. Nothing would have caught the test file — a deleted test is
indistinguishable from a test that never existed, and the suite would simply
have been smaller.

### 2. `router.py`'s entire module tail defined twice

The incoming branch defined `find_repo_root`, `load_ventures`, `load_ledger`,
`calculate_score`, `route_portfolio` and `main` twice, 126 lines apart. Python
binds the second, so the file ran correctly and the duplication was invisible.

The copies had already drifted: the dead first copy omits `funded` from every
queue row and `unallocated_budget_usd` and `unfunded_ventures` from the summary.
Had anything reordered the file — another merge, a formatter, an editor moving a
function — the allocator's JSON consumers would have started raising `KeyError`
on a change that touched no logic.

### 3. Five caps watched twice

`cap_ratchet.py`'s own contract test failed on the first run of the merged tree:
32 watch declarations, 27 distinct. Both branches had independently caught and
registered the ceilings in `image_tags.py`, `sast_scan.py`, `coverage_ratchet.py`
and `stopping_rule_review.py`.

This is the fourth time that test has paid for itself, and the failure mode it
prevents is worth naming: a duplicate watch is not harmless. Two entries for one
constant mean two floors derived from the same history, and the first to be
edited silently becomes the looser one.

## Decided on the merits rather than by side

- **`local-site-studio` keeps "AI call script pack".** The incoming side still
  read "an AI phone agent", which `a73c84e` had removed as a capability claim no
  telephony integration backs. Taking that side would have re-shipped a false
  advertising claim into the venture holding the Stripe checkout — the single
  most expensive line in this merge to have got wrong.
- **`workflow-supply-chain.test.mjs` stays deleted.** Its lockfile-audit half
  duplicates `dependency-audit-coverage.test.mjs`, which is byte-identical on
  both branches and already covers the exemption register; its pinning half
  survives as `workflow-action-pinning.test.mjs` and gained a check it never
  had, that the sweep read a non-empty directory.
- **`quick-pick-survey`'s handler floor goes 28 -> 32**, the measured surface
  rather than a round number, and brings with it the test asserting the proxy
  authenticates nothing.
- **`scripts/test-ci.sh` takes the union of gates**, Cap Ratchet registered once.

## The register fired on its author

`integration_debt.py` failed this merge with eight `unregistered-drop` findings
— the two files above, across four branches each. That is the first integration
performed since the control existed, and it caught the person who had just
written it.

Both are registered in `platform/integration-debt-budget.yaml` with the reason
they were right to drop. The entries are two-directional: when those branches
are pruned the registrations go stale and fail until removed.

## What this does not do

It does not push, merge to `main`, or deploy. Draining the backlog is an
outward action with a production deploy behind it and belongs to the repository
owner. What changed is the cost of that decision: before this pass the owner
faced two candidates that disagreed about the portfolio's stop-loss engine and
no way to tell which was current. Now there is one candidate, 22 of 23 gates
green, and the single red gate is the one asking to be shipped.

# Integration report, 2026-08-04

Branch: `agent/integration-2026-08-04`, built on `agent/integration-2026-08-03`.
107 commits ahead of `main`. Pushed to the local repository only; **nothing has
been pushed to `origin`, and nothing has been deployed.**

## Why this ran

`agent/integration-2026-08-03` ended with an explicit handoff: `main` had moved
underneath it and taken the other side of a duplicate. Both branches carried an
independently built `portfolio/router/kill_criteria.py` for the same roadmap
item. Neither could be merged without choosing, and the choice was left open.

Forty branches hold work that has never reached `main`, and production runs
`origin/main`, which `main` itself is 68 commits ahead of. Until that pile is
consolidated, every control on the roadmap governs code the live services are
not running.

## The choice, and why it went the other way

The 2026-08-03 handoff recommended `main`'s engine, on the grounds that it came
with a ratchet. Read against each other, the branch's engine is the better one
and the ratchet is separable, so the decision was reversed:

* It never collapses "measured, and the answer is zero" into "not measured".
  `main`'s folded revenue into a float starting at `0.0` and skipped months
  recording no `mrr_end`, so a venture nobody had ever measured read as one with
  **zero revenue** — and print-atelier's stop-loss, which is written against
  exactly that metric, would have fired on absence of data rather than absence
  of revenue. Stopping a venture because nobody recorded its numbers is the
  opposite failure from the one this whole item exists to fix, and it is worse:
  it is a wrong stop rather than a missing one.
* It resolves `days_since:<anchor>`, the clock the roadmap notes every "60 days
  post-launch" criterion lacks.

`main`'s two genuinely separable pieces were ported onto it: the
`cumulative_revenue_usd` metric (with the unmeasured/zero distinction restored),
and `has_stopping_rule` plus `scripts/ci/kill_criteria_ratchet.py`, retargeted.
Both CI gates survive — the per-venture register **and** the aggregate ceiling.

## The defect this integration existed to find

`ventures/print-atelier/VENTURE.yaml` holds the only structured kill criterion
in the portfolio. It merged **cleanly**, in `main`'s `comparator`/`threshold`
vocabulary, into a tree whose surviving engine reads `op`/`value` and has no
`cumulative_revenue_usd`. Git had no reason to conflict: neither side touched
the other's file.

Left alone, the portfolio's single working spending brake would have gone
unevaluable and the ratchet would have counted 11 of 11 ventures with no
stopping rule again — undoing the change that had just been celebrated on
`main`, silently, with every test on both branches green. Translated here; the
ratchet still measures 10 of 11, and print-atelier still reads `holding`.

This is the argument for integrating rather than accumulating. Two green
branches produced a red tree, and nothing either branch could have run would
have told it.

## Two more defects the combination exposed

Neither existed in either branch alone.

1. **A withheld venture read as a starved one.** A venture whose stopping rule
   fires and a venture the budget ran out before both end at `$0.00` with
   `funded=False`. The report labelled the first "**UNFUNDED THIS PERIOD** —
   budget exhausted before this rank", crediting the budget cap for a decision
   the criterion made. Split, in the table and in the JSON summary.

2. **One bad ledger row raised everyone else's allocation.** `router.py`'s
   `load_cumulative_spend` wrapped a whole file in one `try`, so a single
   unreadable `agent_spend_usd` discarded the entire month — zeroing recorded
   spend for every *other* venture in it, silently restoring their full explore
   grant, and raising what the router handed them. Now skipped per entry, with
   the bad row named on stderr. Caught by a test from the other branch running
   against this branch's loader for the first time.

A third, smaller: `ledger_rows_by_venture` swallows a `yaml.YAMLError` and
continues, so a corrupt ledger month reads as "these ventures recorded nothing"
— which makes their criteria unmeasurable, which means nothing fires, which
means the review gate finds no decision to demand. Both gates now parse every
ledger file up front and fail on one that does not load. The shared reader still
swallows; that is noted below rather than changed mid-integration.

## Merged

| Branch | What it carries |
|:---|:---|
| `main` (3 commits) | rival kill-criteria engine + ratchet — reconciled as above |
| `agent/money-path-fail-closed-2026-08-03` | Stripe webhook payment status, operator fail-closed, advertised-price parity, proxy fail-closed |
| `agent/sd-offload-verification-2026-08-03` | `photos-import-tools` offload tests |
| `agent/customer-claim-control-2026-08-03` | advertised-price claim contract + repo-wide coverage gate |
| `agent/continue-work-2j-2026-08-03` | triggered rule withholds budget, routes to a human |

## Verification

* `pytest portfolio/ tests/` — **469 passed, 1 failed**
* `platform/ci` contract suite — **95 passed, 0 failed**
* `scripts/test-ci.sh` on the pinned Node 22 — **16 gates passed, 3 failed**
* `scripts/ci/kill_criteria_ratchet.py` — PASS, 10 of 11 without a stopping rule
* `scripts/ci/stopping_rule_review.py` — PASS, 0 triggered, 11 measured
* the ported revenue metric was mutation-checked: restoring `main`'s
  skip-unrecorded behaviour kills exactly one test, the intended one

**Every failure above is the same pre-existing cause and none is from this
merge**: this is a fresh clone with no venture `node_modules`, so `vitest` is
absent and `print-atelier` cannot resolve `tsx`. The gates diagnose it
themselves ("an uninstalled component, not a failing test suite"). Verified by
control: the coverage ratchet fails identically at the pre-merge base commit.

`scripts/test-ci.sh` refuses to run on this host's Node 26 and says why —
`.nvmrc` pins 22. That is the node-version contract working. The run above used
Node 22 explicitly.

## Not merged, and why

Eight branches still hold unique work. None was abandoned for lack of value;
each needs a conflict resolution of the same kind as the two above, and doing
them badly is worse than doing them next.

| Branch | Conflicts in |
|:---|:---|
| `ci/cap-ratchet` | `validate_ventures.py`, roadmap |
| `agent/ledger-continuity-2026-08-03` | `validate_ledger.py`, ledger README |
| `agent/academy-test-script-2026-08-03` | `platform/coverage-baseline.yaml` |
| `agent/release-lag-signal-2026-08-02` | `release_lag.py`, `ci-cd.yml`, roadmap |
| `agent/profit-lever-2026-08-02` | `security.yml`, roadmap |
| `agent/continue-work-4-2026-08-02` | academy site build/style/test, roadmap |
| `agent/route-posture-repo-gate` | `routeAuthPosture.test.ts`, roadmap |
| `agent/route-posture-repo-control` | `scripts/test-ci.sh`, roadmap |

`agent/academy-test-script` conflicts only on the coverage baseline, which is a
recorded measurement — resolving it means re-measuring on Node 22 with venture
dependencies installed, which this environment cannot do.

## What a human still has to decide

* **Nothing here has shipped.** Pushing stays a human decision. `origin/main` is
  68 commits behind local `main` before this branch adds 107.
* **print-atelier's `$150` threshold is still unratified.** It was set by an
  agent, not by the portfolio owner, and it is the only stopping rule in the
  portfolio that can fire.
* **Ten of eleven ventures still have no measurable stopping rule.** The report
  now says so on every row rather than leaving it implicit.
* `ledger_rows_by_venture` still swallows a YAML error. The two gates guard
  themselves; `allocate.py` and `router.py` do not.

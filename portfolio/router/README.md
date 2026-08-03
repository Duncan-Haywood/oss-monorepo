# Portfolio router

Decides which venture gets the next unit of agent effort.

## Why this is not a pure ROI maximizer

The obvious design — rank ventures by return and spend on the top one — is a
greedy bandit. It locks onto whatever is largest today and never funds the
thing that would have been next. That is the opposite of running a portfolio.

Two deliberate constraints:

**Protected explore budget.** Ventures with `budget.protected: true` receive
allocation regardless of measured return. Set the split explicitly rather than
letting the optimizer discover it — a reasonable starting point is 60% to
ventures at `revenue` stage or beyond, 40% to everything earlier.

**Unmeasured is not zero.** A venture with `economics.mrr: null` has not been
measured. A venture with `economics.mrr: 0` has been measured and is not
selling. The router must treat these differently or it will punish new
ventures for being new.

## Attribution honesty

Agent-hours to revenue is noisy, lagged, and confounded. Early versions of
this are a heuristic with a dashboard, not a control loop. Do not add
automated spend escalation on top of a signal that has not been validated
against outcomes for at least a few cycles.

## Inputs

- `ventures/*/VENTURE.yaml` — stage, economics, budget caps, kill criteria
- `portfolio/ledger/` — recorded spend and outcomes over time

## Output

A ranked work queue. Each entry names a venture, a task, and a spend ceiling.

## Contract validation

The router spends real budget off three fields that nothing else checks:
`economics.mrr`, `hypotheses[].status`, and `stage`. Each drifts in the
flattering direction by default — an unmeasured MRR earns more than double the
economics credit of a measured zero, and every hypothesis marked anything other
than `untested` adds to the composite score whether or not it was ever tested.

`python3 portfolio/router/validate_ventures.py` reports that drift by comparing
each `VENTURE.yaml` against the ledger. Add `--strict` to fail on warnings as
well as errors, or `--json` for machine-readable findings. It runs in
`scripts/test-ci.sh` with `--strict`, so errors and warnings both block.

This is deliberately a validator, not an auto-fixer. Correcting a stage or an
MRR reallocates budget, and that is the portfolio owner's call.

## Stopping rules

Each `VENTURE.yaml` declares `kill_criteria`. `kill_criteria.py` evaluates the
structured ones against recorded ledger history and returns `triggered`,
`not-triggered` or `unevaluable` — never treating "no data" as "keep funding
it". `router.py` acts on that verdict, and the report carries all three states:

| State       | What the router does                                            |
|:------------|:----------------------------------------------------------------|
| `triggered` | Allocation withheld ($0.00), ranked last, `suggested_focus` reads STOP, escalated in the report's **Stopping Rules** section |
| `holding`   | Funded normally; at least one criterion is measurable and none fired |
| `none`      | Funded normally, and named in the report — no declared criterion can be measured, so nothing can ever stop this venture's funding |

Withheld budget is not redistributed. Total portfolio spend falls by the amount
withheld, because a brake that hands the money to the next venture commits the
same sum either way. `budget.protected` does not exempt a venture: protection is
a floor for exploration, and a fired criterion says the exploration reached its
declared limit.

Whether to wind a venture down stays a human decision. `stopping-decisions.yaml`
is where that decision is recorded and `scripts/ci/stopping_rule_review.py`
fails the build until it exists — including when a `wind-down` is recorded but
the venture's `stage:` never changes.

Until 2026-08-03 none of this ran: `router.py` parsed `kill_criteria` into a
field it never read, and the evaluation lived only in `allocate.py`, which no
pipeline invokes.

## Status

Implemented in `portfolio/router/router.py` with unit tests in `portfolio/router/test_router.py`. Run `python3 portfolio/router/router.py` or `python3 portfolio/router/router.py --json` to generate the ranked work queue. Integrated into monorepo CI verification (`scripts/test-ci.sh`).

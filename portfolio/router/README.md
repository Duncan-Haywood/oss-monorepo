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

## The budget cap is a ceiling

`compute_allocation` funds ventures in composite-score order and never allocates
more than the portfolio budget cap in total. A protected venture is guaranteed
`PROTECTED_FLOOR_USD` — but that is a floor *within* the cap, not a claim
against money the portfolio does not have.

It used to be the latter, and the cap enforced nothing. The floor was
`max(20.0, remaining * 0.15)`, which ignored `remaining`, so it kept paying out
after the budget was spent; the running total clamped at zero while the loop
carried on. With the current 11 protected ventures the router allocated $200
against a cap of $100, of $10, and of $0 alike. The figure printed at the top of
[the allocation report](../ALLOCATION_REPORT.md) as "Total Portfolio Budget Cap"
bounded nothing — it only looked correct at $300 because 11 ventures happened to
want less than $300. Reachable today: dropping the declared cap to $200, one
third below where it stands, overspent it.

When the cap cannot fund every floor, the shortfall lands on the lowest-scoring
ventures and those ventures are reported as `UNFUNDED THIS PERIOD` by name, in
both the markdown report and `portfolio_summary.unfunded_ventures`. That is the
signal that the portfolio is carrying more protected ventures than it can pay
for; the fix is to raise the cap, lower a `monthly_cap`, or retire a venture.
The router will not overspend to hide it.

The report is also generated with repo-relative links. CI regenerates it, so an
absolute `file://` path meant the committed artifact could never match a
runner's output — every worktree and every runner rewrote all 11 rows.

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

## Status

Implemented in `portfolio/router/router.py` with unit tests in `portfolio/router/test_router.py`. Run `python3 portfolio/router/router.py` or `python3 portfolio/router/router.py --json` to generate the ranked work queue. Integrated into monorepo CI verification (`scripts/test-ci.sh`).

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

## Kill criteria

The validator makes a protected venture declare `kill_criteria`, because
without them there is no condition under which it stops. Until 2026-08-03
`allocate.py` read those criteria into an unused variable, so declaring one and
evaluating one were unrelated acts, and every criterion in the portfolio was
prose.

`portfolio/router/kill_criteria.py` evaluates them. A criterion resolves to
`TRIGGERED`, `NOT_TRIGGERED`, or `NOT_MEASURABLE`, and the third is **not** a
pass — when the data needed to answer the question is absent, "the condition
did not fire" is trivially true and tells you nothing. Conditions combine under
Kleene AND: one definite false settles a criterion, but any unknown among the
rest leaves the whole thing unmeasurable. A venture with no ledger row has
unknown spend, not zero spend.

A criterion is evaluable only if it declares `when` conditions:

```yaml
kill_criteria:
  - id: burn-without-revenue
    description: $150 of recorded agent spend with revenue measured at zero.
    when:
      - metric: cumulative_agent_spend_usd
        op: ">="
        value: 150
      - metric: mrr
        op: "=="
        value: 0
```

Metrics: `mrr`, `customers`, `monthly_cost`, `cumulative_agent_spend_usd`,
`months_recorded`, `consecutive_months_negative_net`, and
`days_since:<anchor>`, which reads a date from the venture's `anchors:` block.
A criterion saying "60 days post-launch" needs that anchor or it can never
fire. A metric outside the set is a broken rule and fails; it cannot be parked.

Anything not evaluable must be listed in
`portfolio/kill-criteria-register.yaml` with the signal it needs, an owner, and
an expiry capped at 180 days. Its `unmeasurable_count` ratchets in both
directions — above it fails because new prose slipped in, below it fails
because the register went stale after somebody made a criterion real.

As of 2026-08-03 that count is 15 of 15. The portfolio has no working automated
stop-loss; what it now has is a dated, owned admission of that, and thresholds
are the venture owner's decision to set.
## Stopping rules

### What a verdict does

`router.py` — the engine `scripts/test-ci.sh` runs, and the one that writes the
ranked work queue in `ALLOCATION_REPORT.md` — acts on the verdict. It used to
carry `kill_criteria` as a field it never read, so a venture could trip its own
declared brake and keep its rank, its budget and its place at the top of the
queue an agent session reads to pick work.

| State | What the router does |
|:---|:---|
| `TRIGGERED` | Allocation withheld ($0.00), ranked last, escalated in the report's **Stopping Rules** section |
| `NOT_TRIGGERED` | Funded normally; at least one criterion is measurable and none fired |
| `NOT_MEASURABLE` | Funded normally, and named in the report — no declared criterion can be measured, so nothing can ever stop this venture's funding |

Withheld budget is not redistributed: total portfolio spend falls by what was
withheld. Handing it to the next venture would mean the portfolio commits the
same sum whether or not a brake fired.

Stopping a venture is a human judgement and stays one, but a judgement nobody is
ever asked for is indistinguishable from no rule at all, so
`scripts/ci/stopping_rule_review.py` fails the build on a triggered criterion
with no decision recorded in `portfolio/stopping-decisions.yaml`.

## Status

Implemented in `portfolio/router/router.py` with unit tests in `portfolio/router/test_router.py`. Run `python3 portfolio/router/router.py` or `python3 portfolio/router/router.py --json` to generate the ranked work queue. Integrated into monorepo CI verification (`scripts/test-ci.sh`).

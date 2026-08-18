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

## Status

Not implemented. The schema and the layout come first so that ventures start
emitting the data the router will need.

**Before starting new work here, check open PRs first.** As of 2026-08-18,
four PRs (#3, #4, #5, #6) independently added the same "fill in missing
VENTURE.yaml" work within about a minute of each other, and none of the
repo's 6 open PRs have merged since 2026-08-08. Right now the router's
actual constraint isn't missing inputs — it's that nothing merges, so the
same gaps keep looking unfilled to each new run. Merge or close the backlog
before adding more router-input work on top of it.

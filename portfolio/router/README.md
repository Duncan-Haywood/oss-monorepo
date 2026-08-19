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

**v1: implemented, ledger not yet wired in.** Every venture under `ventures/`
now carries a `VENTURE.yaml`, so `allocate.py` can read stage, economics, and
budget for all of them and emit a ranked work queue:

```bash
pip install -r portfolio/router/requirements.txt
python3 portfolio/router/allocate.py         # table
python3 portfolio/router/allocate.py --json  # machine-readable work queue
python3 -m unittest discover -s portfolio/router -t portfolio/router
```

v1 ranks by: ventures measured at $0 MRR past `revenue` stage first (they
need a kill/fix decision, not more blind spend), then unmeasured ventures
(protected explore budget), then everything else by stage and monthly cap.
It does not yet read `portfolio/ledger/` — there are no ledger entries yet to
read — and it does not spend anything automatically. Per "Attribution
honesty" above, treat its output as a heuristic worth arguing with, not a
number to act on unreviewed.

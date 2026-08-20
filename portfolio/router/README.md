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

**v1: implemented; ledger read for display only, not yet for ranking.** Every
venture under `ventures/` now carries a `VENTURE.yaml`, so `allocate.py` can
read stage, economics, and budget for all of them and emit a ranked work
queue:

```bash
pip install -r portfolio/router/requirements.txt
python3 portfolio/router/allocate.py         # table
python3 portfolio/router/allocate.py --json  # machine-readable work queue
python3 -m unittest discover -s portfolio/router -t portfolio/router
```

v1 ranks by: ventures measured at $0 MRR past `revenue` stage first (they
need a kill/fix decision, not more blind spend), then unmeasured ventures
(protected explore budget), then everything else by stage and monthly cap.
It now also reads `portfolio/ledger/*.yaml` and prints two informational
counts per venture — neither is used inside `rank()`, so neither spends
anything automatically:

- `ledger` / `ledger_entries_this_period` — entries this month logged with
  `venture: <name>` directly. A reliable count, but as of 2026-08 only
  about 1 in 5 ledger entries use it; most sessions that survey or fix
  several ventures in one cycle log a single `venture: portfolio` entry
  describing all of them in prose instead, which this count alone does not
  attribute back to the ventures mentioned.
- `mentions` / `portfolio_mentions_this_period` — recovers a signal from
  that majority: `venture: portfolio` entries whose outcome text names a
  venture by its exact slug (`count_portfolio_mentions` in `allocate.py`).
  A heuristic, not a precise touch count — text can mention a venture
  without work happening on it, or describe work without the exact slug —
  but it turns what was near-total blindness for most entries into real
  per-venture visibility.

Per "Attribution honesty" above, treat both as heuristics worth arguing
with, not numbers to act on unreviewed.

Every venture in the portfolio is currently unmeasured (`economics.mrr:
null`), so with only stage/cap to go on the "next task" column would read
the same generic "push toward the first real measurement" for all eleven —
not actually useful as a work queue. `next_task()` now reads each venture's
own `hypotheses` list from its `VENTURE.yaml` and names the first one still
marked `status: untested`, so the task each venture gets back is what that
venture itself recorded it needs to learn next, not a placeholder. A
venture with no untested hypothesis left (all `supported`, or none listed)
still falls back to the generic explore task.

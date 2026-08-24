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
the same generic "push toward the first real measurement" for all ten —
not actually useful as a work queue. `next_task()` now reads each venture's
own `hypotheses` list from its `VENTURE.yaml` and names the first one still
marked `status: untested`, so the task each venture gets back is what that
venture itself recorded it needs to learn next, not a placeholder. A
venture with no untested hypothesis left (all `supported`, or none listed)
still falls back to the generic explore task.

## Dispatchable vs. blocked

Naming each venture's own claim made the queue specific. It did not make it
*executable*, and that difference went unrecorded anywhere a tool could read
it.

Nine of the ten ventures' next claims are about what someone outside this
repository will do — pay, sign up, download, answer. None of those ventures
has a `links.production`, so there is nothing published for anyone to respond
to, and publishing is the account owner's decision (see
[`channel-inventory.md`](../pipeline/channel-inventory.md)). The claims are
therefore not merely hard to test; they are unobservable from here.

The router's inputs show the same thing from the other side. Measured on a
full (not shallow) clone at `2c7ae58`:

| | |
|---|---:|
| Ventures with a `links.production` | **0 of 11** |
| Ventures with a measured `economics.mrr` | **0 of 11** |
| Hypotheses ever marked `supported` or `refuted` | **1 of 13** |
| Commits touching any `ventures/*/VENTURE.yaml` | **5** |
| Commits touching `portfolio/ledger/` | **166** |

The last of those five was on 2026-08-19, and it added a venture rather than
recording anything learned about one. So the file the router ranks on is
written roughly once per thirty-three ledger commits: the fleet writes about
what it did far more often than it updates what the businesses are. A queue
built on inputs that never change cannot say anything new, which is part of
why it stopped being read.

Every hypothesis now declares which kind of evidence would settle it:

```yaml
hypotheses:
  - claim: Local businesses will pay $500 flat for a pre-built website.
    status: untested
    checked: null
    evidence: customer-contact   # or: in-repo | external-service
```

- **`customer-contact`** — settled by a user response (signup, contact, usage).
  While `links.production` is null, the router task is **deploy to portfolio
  Hetzner and market without payment** — not "blocked".
- **`in-repo`** — settled against code, data, or documents already here.
- **`external-service`** — needs an app-store, marketplace, or payout account
  the agent cannot hold. Marked **HELD** for that step only; development in
  `ventures/*` continues in parallel.

`validate.py` requires the field. `rank()` sorts ventures with an
external-service hold after those ready to deploy on Hetzner — below a venture
that needs a kill decision, which still comes first. **Development is never
blocked:** every venture has product, test, UX, deploy, and marketing work
available regardless of hypothesis type.

**This is a reporting change, not a discovery.** The old model marked nine of
eleven ventures "blocked on publish" and told sessions to stop. That was wrong:
customer-contact hypotheses are settled by deploying to Hetzner and driving
traffic, which agents can do today. The field now routes that work instead of
hiding it behind a blocker string.

## Merit is a separate axis

[`portfolio/scoring/`](../scoring/) scores ventures on business quality.
`allocate.py` reports merit alongside the work queue and uses it to break ties
within the same priority band. Merit does **not** gate development — a
high-merit venture waiting on an app-store account still gets full in-repo
work; deploy and market on Hetzner first.

`decisions_by_merit()` groups only `external-service` holds (app store,
marketplace, payout rail) for the owner decision queue. It no longer treats
"needs a production URL" as a blocker.

## What each owner decision unblocks, weighted by merit

`decisions_by_merit()` groups ventures whose next hypothesis needs an
**external-service** account (app store, marketplace, payout rail) and reports
how much merit waits on each owner decision. Customer-contact ventures are not
included — agents deploy to Hetzner and market without waiting.

This is a reporting aid for issue #139, not a development gate. Pair merit
unblocked with cost in `asks.yaml`; the cheapest ask and the highest-merit one
are often not the same.

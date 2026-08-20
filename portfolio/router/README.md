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

## Dispatchable vs. blocked

Naming each venture's own claim made the queue specific. It did not make it
*executable*, and that difference went unrecorded anywhere a tool could read
it.

Nine of the eleven ventures' next claims are about what someone outside this
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
    evidence: customer-contact   # or: in-repo
```

- **`customer-contact`** — settled only by a response from outside this repo.
  The router marks it `BLOCKED` while `links.production` is null.
- **`in-repo`** — settled against code, data, or documents already here.
  `photos-import-tools` is the worked example: its claim that stateful
  imports reduce failed transfers was marked `supported` on 2026-07-29
  without any buyer in it.

`validate.py` requires the field, so a new venture cannot quietly reappear at
the top of the queue with work no session can start. `rank()` sorts
dispatchable work above blocked work — below a venture that needs a kill
decision, which still comes first — and `allocate.py` prints how many of the
eleven a session could actually pick up.

**This is a reporting change, not a discovery.** Searching the parsed
outcome text of `2026-08.yaml` finds at least three entries, from separate
cycles, already concluding that the top-ranked task is "outside what an
unattended session can drive" or "outside what a code-focused agent session
can execute" — and two of those say they are themselves consistent with
earlier entries phrased differently, so the real count is higher. Each was
written in prose; none of it reached the router; the next session got the
same impossible queue and wrote the finding down again. The point of the
field is that the tool now says it once, instead of each session paying to
rediscover it.

## Merit is a separate axis, and it does not agree with this one

Everything above ranks on whether a session can *start* on a venture. That is a
question about testability. [`portfolio/scoring/`](../scoring/) answers the
other one — whether the business is any good — by scoring all eleven ventures
on the six dimensions `ai-first-markets` uses for its idea library.

The two orderings disagree, and not mildly. The two dispatchable ventures sit
at merit ranks 6 and 10 of 11, and their mean composite (4.33) is *below* the
blocked ventures' (4.74). The reason is structural rather than accidental: a
venture only has an `in-repo` next question when nobody is currently trying to
sell it, so **dispatchability anti-selects for commercial intent**. Both
dispatchable ventures are the two with no price and no buyer —
`ai-first-markets` is access-restricted to one email address, and
`photos-import-tools` has no monetization language anywhere in it.

`allocate.py` therefore reports both rather than letting one stand in for the
other:

- a `merit` column, read from `portfolio/scoring/venture-scores.yaml`;
- ventures that are otherwise tied are ordered by merit instead of by
  `monthly_cap`, which was an input the portfolio assigned rather than evidence
  about the venture;
- when the highest-merit venture is blocked, the header says so by name.

Merit sorts strictly *below* dispatchability in `rank()`. Promoting it would
put work no session can start back at the top of the queue, which is the
failure the dispatchable field was added to fix.

### The one judgment call

`ai-first-markets` is marked `in-repo`, which contradicts a prior ledger
entry calling its claim "a customer-usage hypothesis test". Both readings
are defensible: the claim is that a market map "improves which AI-first
venture to validate next", and the decisions it would improve are recorded
in this repository. Its own kill criteria settle it — "no decision or
validation workflow uses the platform within 90 days" is checkable here,
with no outsider involved.

It is marked dispatchable deliberately rather than confidently. If it is
wrong, a session picks the task up, finds it needs an outside response, and
flips one field. The opposite error is worse: mark everything blocked and
the queue reports that the portfolio has no available work at all, which is
the conclusion that produced the meta-work it is supposed to replace.

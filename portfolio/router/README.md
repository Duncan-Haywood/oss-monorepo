# Portfolio router

Decides which venture gets the next unit of agent effort.

**2026-08-24 direction:** the router ranks work, but the fleet's default is
product shipping, not router maintenance. Prefer dispatchable `in-repo`
hypotheses and ventures with runnable software over blocked
`customer-contact` hypotheses until a product exists to show users. See
[`../DIRECTION.md`](../DIRECTION.md).

## Corrected 2026-09-06: `links.production` was stale fleet-wide, and it was the thing this tool's whole "blocked" verdict rests on

Every one of the 195 `ventures/*/VENTURE.yaml` files carried `links:
production: null` as of this session — including the 186 whose static page
`platform/pages/build.mjs` has been building into the GitHub Pages artifact
for weeks, and which `portfolio/DIRECTION.md` and
`python3 platform/ci/pages_state.py` already confirm are live at
`https://duncan-haywood.github.io/monorepo-projects/<slug>/`. This tool reads
`links.production` as the one signal that decides whether a
`customer-contact` hypothesis is `BLOCKED` (see "Dispatchable vs. blocked"
below), so a null field that should have said "published two weeks ago" was
reporting **0 of 194 ventures dispatchable** — the entire fleet, including
the two highest-merit ventures in the whole scored set — every time a session
ran `allocate.py` to decide what to work on.

Fixed by setting `links.production` to the venture's actual `<base>/<slug>/`
URL for every slug `node platform/pages/build.mjs --out=<dir>` actually
produced a page for — read from the builder's own output, not
re-derived from a copied include/exclude list (see `CLAUDE.md`'s
`venturePageRoot` story for why that specific shortcut has cost live product
twice already). That is 186 of the 195 ventures. Of the other 9 — `ai-first-markets`,
`garmin-world-traveler-watchface`, `local-site-studio`, `photo-editing`,
`photos-import-tools`, `quick-pick-survey`, `retail-pilot-intel`,
`vendor-watch`, `world-clock-widget` — none has a static page the builder
produces, so all 9 correctly kept `links.production: null`. `ubuntu-agent-server`
is a tenth non-static directory (the headless agent box) but carries no
`VENTURE.yaml` at all, so it was never in the router's input and this fix
does not touch it. `ai-first-markets` is further excluded from the router's
ranking entirely as `NOT-A-VENTURE`, per "The one judgment call" below, so
only 8 show up as `BLOCKED` in `allocate.py`'s table.

`allocate.py` now reports **186 of 194 ventures dispatchable**. Read the
sections below for how the tool reasons about that split; do not read their
worked examples ("0 of 11", "9 of 11 ventures ... blocked on a single
decision, publishing") as today's numbers — they describe an 11-venture
portfolio from 2026-08-20, long before this one grew to 195 and long before
GitHub Pages went live, and are kept as the reasoning trail, not a live
reading. Run `python3 portfolio/router/allocate.py` for the current one.

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
- `portfolio/usage/usage.yaml` — usage readings per product. **Read by humans
  and sessions, not yet by `allocate.py`.** Added 2026-08-24 with
  [`../DIRECTION.md`](../DIRECTION.md): everything ships free, so revenue is
  zero by design and MRR ranks nothing. Until the code reads it, apply it by
  hand — **a product with returning users outranks the router's output and every
  candidate in the pipeline.** Wiring it in is a worthwhile change to
  `allocate.py`; making it the tiebreaker below `stage` is the obvious shape.

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
ten a session could actually pick up.

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

The two orderings disagree, and not mildly. The one dispatchable venture sits
at merit rank 9 of 10, and its composite (4.17) is *below* the blocked
ventures' mean (4.74). The reason is structural rather than accidental: a
venture only has an `in-repo` next question when nobody is currently trying to
sell it, so **dispatchability anti-selects for commercial intent**. The single
dispatchable venture is the one with no price and no buyer —
`photos-import-tools` has no monetization language anywhere in it. (The other
formerly-dispatchable directory, `ai-first-markets`, was reclassified out of
the allocated set on 2026-08-20 and no longer appears in the router's queue —
see its `NOT-A-VENTURE` marker.)

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

## What each owner decision unblocks, weighted by merit

The two axes above answer "which venture next" for a *session*. They do not
answer the question the account owner's decision queue (issue #139) turns on:
of the decisions only a human can make, which one releases the most, and is
that the same as the one that costs the least? The #323 scoring pass found it
is not — the highest-merit venture (`local-site-studio`, 6.00: coded and
tested Stripe checkout, a $500 + $99–199/mo ladder, the only buyer in the
portfolio holding a business budget) sits behind the ask ranked *last* in #139
for being the most expensive, while the cheap asks at the top of that queue
serve pipeline candidates rather than any venture. The queue was ordered
cheapest-first, which was correct while nothing was known about what each ask
released; now something is.

`allocate.py` closes that half. It already records, per venture, *why* no
session can start it (`blocked_on`) and *how good the business looks*
(`merit`). `decisions_by_merit()` adds them up the other way: it groups the
blocked ventures by the owner-gated decision that would unblock them and
reports, per decision, how many ventures wait on it, the total composite merit
it would release, and the single highest-merit venture in that group (because
one 6.00 unblocked can matter more than three 4.00s, and the sum alone hides
that). The table prints it under the work queue; `--decisions` emits it as
JSON.

Run today it collapses to one line, and that *is* the finding: **9 of the 11
ventures — 42.67 total merit, `local-site-studio` at the top — are blocked on
a single decision, publishing.** Nearly the entire portfolio's merit is
waiting on one owner call, not spread across the several cheaper asks the #139
ordering leads with. This is a reporting change, not a recommendation: it does
not reorder #139 or make the publish decision, both of which stay the owner's.
It puts the merit-unblocked number next to the cost so the two can be read
together, which is what the cheapest-first ordering left out. As more distinct
`evidence: customer-contact` blockers appear (a venture blocked on something
other than publishing), the rollup gains rows and the comparison sharpens; the
line stays honest because the blocker string is computed from each
`VENTURE.yaml`, not written down anywhere that can go stale.

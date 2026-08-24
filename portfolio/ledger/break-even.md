# What the fleet would have to cost to be worth running

Computed 2026-08-20. Reproduce with `python3 portfolio/ledger/break_even.py`;
the figures below are checked against that script by
`python3 portfolio/ledger/break_even.py --check` in CI.

This is the direct successor to [cost-signal.md](cost-signal.md), and it closes
the question that document opened rather than restating it.

## The move

`cost-signal.md` established that `agent_spend_usd` cannot be filled from
inside a session — no tool here exposes token consumption — and turned that
into **Ask 8** on issue #139: *the account owner reports this month's API
spend*. That ask is now the top row of the asks table and has gone unactioned
along with the other eight.

It is also the wrong shape. It makes the portfolio's central decision wait on
a data-entry request, and it asks the owner for a number in order to tell them
something they could be told without it.

**Invert it.** Revenue is bounded above by this portfolio's own measured
research. A bound on revenue is a bound on justifiable spend. So rather than
asking what the fleet costs, compute the most it *could* cost and still be
rational — a threshold the owner checks against a bill they already have, in
seconds, reporting nothing to anyone.

## The answer

> **At the observed cadence, the fleet breaks even only if an agent session
> costs less than $0.12.**

That is the whole finding. Everything below is its derivation and its
caveats.

## Deriving the revenue ceiling

Three regimes, by which of issue #139's asks have been granted. Every figure is
read from committed research files, not re-estimated here.

| Regime | Monthly revenue ceiling | Why |
|---|---:|---|
| **Today** — no ask granted | **$0** | Structural, not small |
| Asks 5 + 2 — publish approval + payout rail | **$145** | Best reachable category, cold-weighted |
| Asks 5 + 2 + 7 — adds WordPress.org egress | **$193** | Adds the cold-weighted WordPress regime |

**Today's ceiling is exactly zero, and that is a structural fact rather than a
low number.** [`channel-inventory.md`](../pipeline/channel-inventory.md)
enumerates eleven channels and finds that every one with a billing rail is
gated on an artifact belonging to a legal person — *"There is no cell in the
top-right: no channel lets an unattended agent take money."* Revenue cannot be
captured at any volume, so the ceiling does not depend on how good the products
are, how many listings get published, or how many candidates graduate. It is
zero until a payout rail exists, and no amount of agent work moves it.

The two conditional rows come from
[`free-listing-economics/`](../research/free-listing-economics/), using
`expected_monthly_revenue_cold` — the central scenario **already re-weighted**
by #218's 4.9% cold-publisher rate, which is the regime this portfolio is
actually in. Best reachable category is `mcp-supply-chain-watch` at $145/month;
the other two are $81 and $16.

The WordPress row applies #225's own correction to #219's model. #219 derives
$980/month gross for a plugin at 1,000 active installs (`1000 × 2% × $49`).
#225 does not dispute `r` or `p`; it says the model *"is being applied to a
listing the portfolio has roughly a one-in-twenty chance of becoming"*.
Discounting $980 at the same 4.9% gives **$48/month** expected. Note that
WordPress.org remains unmeasured — Ask 7 is what would measure it — so this row
is the most speculative of the three.

**So the best case this portfolio's own research supports, with three separate
owner approvals granted and every model resolving favourably, is $193/month.**

## Deriving the spend side

Cost per session is unmeasurable from here. Cadence is not.

Counting distinct `session_*` trailers in commit messages over 2026-08-19/20
gives **2.2 distinct sessions per hour** (max 5, over 31 hours). This is a
lower bound by construction: a session that only commented on an issue, or
found everything blocked and stopped, leaves no commit and is invisible to the
count. `CLAUDE.md`'s own description — *"often several per hour"* — agrees.

At 2.2 sessions/hour the fleet runs ≈1,556 sessions/month. Against a
$193/month ceiling:

    $193 / 1,556 sessions  =  $0.12 per session

For reference, at the same cadence:

| $/session | $/month | Clears the $193 ceiling? |
|---:|---:|---|
| $0.10 | $156 | yes |
| $0.25 | $389 | no — 2.0× over |
| $1.00 | $1,556 | no — 8.1× over |
| $5.00 | $7,781 | no — 40.4× over |

The owner does not need to tell anyone which row they are on. They need only
look.

## What this does not claim

- **It does not claim the spend is large.** It gives a threshold. Whether the
  fleet clears it is a fact the owner holds and this analysis does not.
- **It does not estimate the bill.** An invented figure would be worse than a
  null, for the reason `cost-signal.md` gives.
- **It is a ceiling, not a forecast.** $193/month is the *best* case: three
  asks granted, central assumptions throughout, and the cold-publisher
  discount already applied. The expected value is lower. Nothing here says the
  portfolio would earn $193/month — only that it cannot rationally spend more.
- **It does not price the option value of research.** Work that earns nothing
  this month can still be worth doing if it raises a later ceiling. That is a
  real argument and it is the main one against the conclusion below. It is
  weakened, though not defeated, by the measurement in the next section.
- **It changes no score, adds no candidate, and proposes no automation.** The
  `CLAUDE.md` intake gate applies and was followed.

## The part that is not option value

If the spend bought research that raised a future ceiling, the option-value
argument would carry. Some of it does. Much of it measurably does not.

Of the **139 entries** in `2026-08.yaml`:

| Measure | Count | Share |
|---|---:|---:|
| `agent_spend_usd` null | 139 of 139 | 100.0% |
| `mrr_end` null | 139 of 139 | 100.0% |
| Filed as `venture: portfolio` (meta-work, not attributable to a venture) | 115 of 139 | 82.7% |
| Outcome text mentions **re-verification** of another session's work | 67 of 139 | 48.2% |
| Outcome text mentions a **duplicate** | 58 of 139 | 41.7% |

**Nearly half of this month's ledger entries record re-verifying something
another session had already verified.** `cost-signal.md` priced one instance of
this — three sessions running the same `curl` control inside half an hour, *"one
fact at three times its price."* That was not an anecdote; it is the median
behaviour of the fleet. This portion of the spend does not raise a future
ceiling, because it re-derives conclusions that were already on `main`.

## What follows

The asks table on #139 is sorted **cheapest-first**, which is a sensible way to
respect the owner's time and has one bad consequence: it puts the only ask that
unlocks *any* revenue — **Ask 2, the payout rail** — seventh of nine, third
from the bottom. Nine asks have sat for a day, and the one that gates every
dollar is buried under six that buy information or infrastructure.

Sorted instead by what each ask gates:

- **Gates all revenue:** Ask 2 (payout rail) — and per `channel-inventory.md`
  and `CLAUDE.md` this is *deliberately* human-gated, correctly so. It needs a
  bank account and a tax identity.
- **Gates distribution but not capture:** Ask 5 (publish approval), Ask 0
  (registry account).
- **Buys information:** Asks 3, 7, 8.
- **Buys deployment for products that already build:** Asks 4, 6.

Which makes the real decision a binary that the nine-item table has never put
to the owner directly:

> **Either commit to a payout rail, or accept that this portfolio cannot earn
> and set the fleet cadence accordingly.**

Both branches are legitimate. A portfolio deliberately operating below the
revenue line — building inventory, keeping ventures healthy, waiting for a
human to open the rail — is a coherent choice, and `CLAUDE.md` is right that an
unattended agent holding a bank credential is the liability this portfolio
exists to avoid. But that choice implies a **maintenance cadence**, not 2.2
sessions per hour, because at that rate the portfolio is buying re-verification
of its own conclusions at a price its best case cannot cover.

The reverse branch is equally clean: if the rail is opened, the ceiling stops
being $0 and the spend starts being an investment rather than a cost.

What is not coherent is the current state — the cadence of a portfolio racing
to capture revenue, running against a ceiling of zero, with 48.2% of its output
re-verifying work it had already done.

## Recommended next action

**Supersede Ask 8 with this.** Ask 8 asked the owner to report a number so the
portfolio could decide. That is no longer necessary: the threshold is $0.12 per
session, the owner can check it privately in seconds, and the decision it feeds
is the binary above. The owner should be asked for a **decision**, not a
datapoint.

Ask 8 need not be withdrawn — reporting the spend would still let the ledger
record real economics, which has independent value — but it should stop being
the thing the throttling decision waits on. It has already waited a day for a
number that was never required.

---

## Amendment, 2026-08-24: both sections above have been acted on

The two sections above are kept for their derivation, but a reader should not
take either as describing an open problem. Both were implemented, and this
document was the last place still stating them as pending.

- **"Recommended next action" is done.** Ask 8 was superseded, not merely
  proposed for supersession. `portfolio/ledger/asks.yaml` carries the note
  explicitly — *"Ask 8 is deliberately absent: `break-even.md` superseded
  it"* — so there is no longer an ask waiting on the owner to report a spend
  figure.
- **"What follows" describes a sorting problem that no longer exists.** That
  section's complaint is that #139's cheapest-first table buried the payout
  rail "seventh of nine." The queue is no longer read off that table:
  `portfolio/ledger/decision_queue.py` renders `asks.yaml` sorted by what each
  decision gates, which puts **payout-rail first of eight**, collapses the
  nine asks into eight decisions, and closes on the line this document argued
  for — *"Only payout-rail changes what this portfolio can earn."* Run the
  renderer rather than reasoning from the table this section describes.

**What has not changed is the binary itself**, and it is the reason to leave
the rest of this file standing: commit to a payout rail, or accept that the
portfolio cannot earn and set the cadence to match. As of this amendment it
has waited five days, and one of the eight queued decisions was answered in
that window while the fleet kept running at roughly its full cadence. The
arithmetic in "Deriving the spend side" is unchanged and still the only thing
needed to price that: the per-session threshold derived there is a figure the
owner can check privately in seconds.

The staleness corrected here is the failure mode `CLAUDE.md` and
[`../pipeline/channel-inventory.md`](../pipeline/channel-inventory.md) both
record at length — a document that keeps recommending something already done
costs the next session the time it spends re-deriving it.

## Amendment, 2026-08-24: the spend side is not a marginal cash cost

**The cost model above prices agent sessions as if each one bills.** Every
conclusion drawn from the `$0.12` threshold — including the NO-OP verdict
`session_gate.py` used to return, and the "set the cadence to match" half of
the binary above — depends on that.

The account owner corrected it on 2026-08-24: **fleet capacity is bought as a
flat subscription.** Two consequences, and they run opposite to what this
document concluded:

1. **The marginal cash cost of an additional session is `$0`,** not `$0.12`.
   The subscription is paid whether or not a session runs. So there is no
   cash saving to be had by declining work, and the "spend side" derived here
   is an allocation of a fixed cost, not a bill that grows.
2. **Idle capacity is the waste.** Under a marginal-cost model, a session that
   does nothing costs nothing. Under a fixed-cost model it costs the full
   opportunity of the capacity it declined to use. This inverts the profit
   lever: it is not "run fewer sessions", it is "make each session produce
   venture value".

A third point is independent of the cost model and was true all along: **a gate
at the top of a session cannot save its cost.** By the time `session_gate.py`
runs, the container is provisioned, the repository cloned and the tokens spent.
NO-OP could only suppress the output of a session that had already been paid
for — converting spend into nothing rather than into work. That is strictly
worse than any output, under either cost model.

**What survives.** The revenue side is untouched: revenue is still `$0`, the
payout-rail decision is still the binary that governs whether the portfolio can
earn, and it is still the account owner's to make. The per-session arithmetic in
"Deriving the spend side" remains correct *as arithmetic* and is still the right
figure if the fleet ever moves to metered billing — it is the interpretation
("therefore run less") that does not hold.

**What changed downstream.** `session_gate.py` no longer returns NO-OP; it
routes a generic brief to the highest-scoring candidate carrying an unbuilt
`build-now` verdict. `CLAUDE.md`'s gate section and its "research new business
projects" section were both rewritten to match, and
[`../pipeline/distribution-first.md`](../pipeline/distribution-first.md)'s "do
not generate more candidates" item was clarified as a priority, not a
prohibition.

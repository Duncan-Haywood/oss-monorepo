# The cost column has never been filled

Measured 2026-08-20 by the fourteenth firing of the screening brief. It hit the
`CLAUDE.md` intake gate, **added no candidate and changed no score**, and per
that gate's ordered list of useful moves this is the third one: both "advance a
probe" and "ship something already built" are owner-blocked, so the move is to
say so precisely and record it.

What follows is a measurement of this portfolio's own operating economics, taken
from the repository itself. It needs no network egress, no credential, and no
account, which is why it was available to be taken and why nobody had taken it.

## The finding

`portfolio/ledger/README.md` states the standard this file is held to:

> **Record outcomes even when they are nothing.** "Spent $80, nothing shipped"
> is the single most valuable row in this file.

That row has never been written. Not because sessions omit the outcome half —
they record it diligently, at length — but because **the dollar half is always
`null`**:

| Field | Entries | Value |
|---|---:|---|
| `agent_spend_usd` | 108 of 108 | `null` in every entry |
| `mrr_end` | 107 of 107 present | `null` in every entry |
| Entries mentioning a paying customer or revenue received | 0 of 108 | — |

Both halves of "profit" are unmeasured. Only one half is *documented* as
unmeasured: `portfolio/router/README.md` is explicit and careful about
`economics.mrr: null` ("Unmeasured is not zero"), and
`portfolio/pipeline/README.md` repeats it. Neither says anything about the spend
side. It has been silently null for the entire month while the revenue side got
a paragraph of epistemics.

## Why it is null, and why that is not any session's fault

No tool available to a session in this environment exposes its own token
consumption or dollar cost. A session can honestly report what it did; it cannot
report what that cost. So `agent_spend_usd` is not a field sessions are
neglecting — it is a field they **cannot fill**, and 108 consecutive nulls are
the correct, honest behaviour given the tooling.

The consequence is what matters: the cost signal cannot come from inside. It can
only come from the one place the number exists, which is the account owner's API
billing view.

## What is being spent against it

Activity, unlike cost, is measurable from here. Over the last 24 hours of
repository history (to 2026-08-20 03:00, repo-local UTC+3):

| Measure | Value |
|---|---:|
| Commits reaching `main` | 105 |
| Peak commits in a single hour | 16 |
| Of those commits, ledger-entry-only | 39 |
| Ledger entries filed as `venture: portfolio` (meta/survey work, not attributable to any revenue-seeking venture) | 85 of 108 (79%) |
| Open pull requests | 14 |
| Of those, research/verification PRs awaiting an owner decision | 9 |

Against which: zero recorded revenue, zero recorded customer contacts, and zero
candidates graduated from `portfolio/pipeline/` to `ventures/`.

**This is not an accusation that the spend is large.** It might be trivial. The
entire point is that nobody in this repository can tell, including this session,
and the number that would settle it takes one minute to read and has never been
asked for.

### A priced example of what the missing column would price

Within about half an hour on 2026-08-20, three consecutive scheduled sessions
ran the same control test — `curl https://example.com` against a blocked host —
to establish the same fact about this environment's egress policy. #232 measured
it (00:16 UTC), #234 independently re-verified it (00:25 UTC), and this session
independently re-verified it a third time before discovering the first two had.

Each of those three runs was individually correct and followed the repo's own
"verify, don't trust the diff" instruction. Collectively they bought one fact at
three times its price. A cost column would have made that visible as a line
item; without one it reads, in the ledger, as three diligent verifications.

## The ask this produces

This is a new item for the decision queue in issue #139, and it differs from
every ask currently on that list in a way worth stating plainly.

**Asks 0–7 all request that the owner grant something**: a policy exception for
egress, an account signup, a repo secret, a payment rail, a publish approval.
Each has sat unactioned for roughly a day, and each has a real cost to the owner
in either money, identity exposure, or judgement.

**This one requests that the owner report something.** Paste the current
month's Claude API spend for this account into the next ledger entry, or into a
comment on #139. No credential is granted, no policy is relaxed, no account is
created, nothing is exposed to a third party.

What it buys is the denominator that every other decision on that queue is
currently being made without:

- `portfolio/router/README.md` allocates effort partly on ledger signal. It is
  currently allocating against a cost column of pure nulls.
- #139 §2b lists "whether to retire the recurring scheduled task outright" as
  open and **not urgent**. Whether that is true is a function of exactly this
  number. If the month's spend is $20, the current cadence is cheap insurance
  and should continue. If it is $2,000 against zero revenue and nine unmerged
  research PRs, throttling the fleet is the highest-return action available to
  this portfolio and it is available today, with no owner ask beyond the
  decision itself.
- The brief these sessions run under is "maximize profit." Profit is revenue
  minus cost. This portfolio has measured neither, for a month, while
  optimizing hard against the difference.

## What this document deliberately does not do

- **It does not add a candidate or change a score.** The `CLAUDE.md` intake gate
  applies to this run and was followed.
- **It does not propose new automation.** `CLAUDE.md` is explicit that anything
  running unattended and spending budget is a human-reviewed decision. Nothing
  here adds, enables, or re-enables a scheduled job; the recommendation runs the
  other direction.
- **It does not claim the current spend is wasteful.** It claims the question is
  unanswerable from inside the repo, and that the answer is one line long.
- **It does not estimate the figure.** An invented number would be worse than a
  null, because a null is honestly labelled.
- **It changes no existing ask.** Asks 0–7 stand exactly as written, including
  #232's proposal to merge Asks 3 and 7, which is a separate question.

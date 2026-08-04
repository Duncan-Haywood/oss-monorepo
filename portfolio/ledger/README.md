# Ledger

Append-only record of what was spent on each venture and what happened after.

One file per month: `YYYY-MM.yaml`.

```yaml
period: 2026-07
entries:
  - venture: retail-pilot-intel
    agent_spend_usd: 42.10
    human_hours: 3
    outcomes:
      - Shipped pilot dashboard.
      - First demo booked.
    mrr_end: 0
```

Two rules that keep this useful:

1. **Append, do not edit.** Rewriting history to look better destroys the only
   signal the router has.
2. **Record outcomes even when they are nothing.** "Spent $80, nothing shipped"
   is the single most valuable row in this file.

## Spend must be metered per venture, not split

Rule 2 needs a per-venture cost to sit against the outcome. A month's total
divided evenly between ventures is not one, and it is not a neutral placeholder
either — `portfolio/router/router.py` sums `agent_spend_usd` into
`load_cumulative_spend()` and decays each venture's explore grant against its
own lifetime total. An even split decays every venture by the same amount, so
the mechanism that exists to stop rewarding ventures that absorb budget and
report nothing cannot separate them from ventures that are genuinely new.

`2026-07` is the worked example of getting this wrong: seven entries, each
recording `agent_spend_usd: 18.18`, which is $127.26 divided seven ways. It
cannot be repaired — rule 1 forbids rewriting it, and the true per-venture
figures were never captured. It stands as recorded, and the "spent $80, nothing
shipped" row cannot be written for July in either direction.

For each new month, attribute spend to the venture that drew it before the
month closes. Zero is a valid, useful figure; an absent one is not, and the
router reads it as `0.0`, which earns the *maximum* explore credit. Under this
ledger's own incentives, omitting a cost pays better than recording it — record
it.

## Do not record the allocation as the spend

`portfolio/ALLOCATION_REPORT.md` and `portfolio/router/allocation_queue.json`
say what each venture was *granted*. This file says what each venture *drew*.
Copying the first into the second is the same defect as the even split one shape
further on, and it is harder to see, because the figures differ from each other
and so look metered.

It also closes a loop. The router allocates from cumulative spend; if the
allocation is written back as the spend, the allocator is reading its own output
as evidence about the world. A venture that drew nothing then decays exactly as
if it had spent its whole grant, and one that overran is recorded as having
stopped at the cap.

`2026-08` is the worked example: six of its nine entries record, to the cent,
the figure the allocation report grants that venture — `$40.00`, `$30.00`,
`$28.50`, `$24.22`, `$20.59`, `$6.80` — and three more sit within fifteen cents
of it. Recorded on the second day of the month, before the spend it describes
could have happened.

An unmetered month has an honest form, and it is not a plausible number: record
`0` where nothing was drawn, and state in `outcomes` that the figure is
unmetered where it is. The check below reports; per rule 1 it must not be
answered by rewriting a month that is already recorded.

## What is checked

`python3 portfolio/router/validate_ledger.py` runs in CI as "Portfolio Ledger
Validation" and fails on the defects that corrupt the join into the allocator:
a `venture` matching no `ventures/*/VENTURE.yaml`, the same venture on two rows
in one period, an absent or negative `agent_spend_usd`, a `period` disagreeing
with its filename, and a file that is not a `YYYY-MM.yaml` month.

It also fails on a month that is simply not here — `ledger-gap` for a month
missing inside the recorded span, `stale-ledger` when the newest month falls two
months behind the calendar. Both are errors, which means **not writing a month
breaks the build.** That is deliberate. `portfolio/router/kill_criteria.py`
measures each venture's stopping rules against `cumulative_agent_spend_usd`, and
that figure is this directory summed: skip a month and the total silently
understates what was spent, so a threshold the portfolio owner set is never
reached and the rule that should stop funding a venture never fires. An absent
month is not a missing record, it is a smaller number.

The one way to clear `stale-ledger` is to close the month. Raising
`STALE_LEDGER_MONTHS` in the validator also clears it, and doing that quietly is
the erosion the check exists to expose — change it in a commit that says so.

Months from before this ledger existed are not gaps. The span is bounded by the
recorded months themselves, so the repository being older than its ledger is not
reported, and rule 1 forbids backfilling it anyway.

Missing `mrr_end`, empty `outcomes`, split spend, and spend that mirrors the
allocation are warnings rather than errors, because a closed month can only be
annotated. Pass `--strict` to fail on those too; the CI gate deliberately does
not, until a full month is recorded with metered per-venture spend.

The mirror check compares each entry against the budget the allocator is on
record as granting *that same venture*, and only exact cent-for-cent agreement
counts, so three or more matches in one month is the signature. Two limits worth
stating: a venture that genuinely draws its whole grant is indistinguishable
from a copied one, which is why a single match is ignored; and figures nudged a
few cents off the grant are not caught at all. It detects copying, not
fabrication in general.

If either allocation artefact exists but no per-venture figure can be read out
of it, that is an **error**, not silence. Both are generated, so their format can
move, and a parser that quietly matches nothing would leave this check passing
forever while enforcing nothing.

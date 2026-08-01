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

## What is checked

`python3 portfolio/router/validate_ledger.py` runs in CI as "Portfolio Ledger
Validation" and fails on the defects that corrupt the join into the allocator:
a `venture` matching no `ventures/*/VENTURE.yaml`, the same venture on two rows
in one period, an absent or negative `agent_spend_usd`, a `period` disagreeing
with its filename, and a file that is not a `YYYY-MM.yaml` month.

Missing `mrr_end`, empty `outcomes`, and split spend are warnings rather than
errors, because a closed month can only be annotated. Pass `--strict` to fail on
those too; the CI gate deliberately does not, until a full month is recorded
with metered per-venture spend.

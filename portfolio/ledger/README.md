# Ledger

Append-only record of what was spent on each venture and what happened after.

**2026-08-24:** record **shipping outcomes**, not meta-work. If a session
looked but did not build, skip the entry. See [`../DIRECTION.md`](../DIRECTION.md).
Usage numbers do not belong here — they go to
[`../usage/usage.yaml`](../usage/usage.yaml), which keeps a per-product series
this month-by-month file cannot.

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

See `CLAUDE.md`'s "Ledger discipline" section for two situations this file
alone doesn't cover: never bundling an entry into a PR that's waiting on the
account owner, and what a session constrained to a single such branch should
do instead of skipping the record entirely.

## Analyses of this ledger

- [cost-signal.md](cost-signal.md) — why `agent_spend_usd` has been `null` in
  every entry, and why that is the correct behaviour rather than neglect: no
  tool available to a session can see its own token cost.
- [break-even.md](break-even.md) — what the fleet would have to cost to be
  worth running, derived by inverting the question `cost-signal.md` asks. The
  answer does not require the owner to report anything.
  Reproduce: `python3 break_even.py`. The document reports a **dated
  snapshot** (`results-break-even-2026-08-20.json`), because this ledger grows
  several times an hour and a live figure would be stale before it was read.
  `--check` verifies the document against that snapshot and runs in CI;
  `--refresh` re-measures deliberately.

## The owner's decision queue

- [asks.yaml](asks.yaml) — every item waiting on the account owner, as data:
  what one action closes it, what that unlocks, what it costs in exposure, and
  which other item blocks it. Render it with `python3 decision_queue.py`.

  Issue #139 remains where the owner answers. This file is the *structure*, and
  it lives in git for a specific reason: #139's body is rewritten in place by
  whichever session edits last, and on 2026-08-24 two concurrent sessions
  clobbered it twice in one day (#697, #698). Git merges concurrent edits; an
  issue body does not.

  It carries two axes the #139 asks table does not, and both change the answer.
  `blocked_by` records that granting an ask can buy nothing while another ask
  gates it — true of Ask 5 today, which `CLAUDE.md` states in prose while the
  table still lists it as available. `exposure` separates a repository Settings
  toggle from opening a merchant-of-record account, which a cheapest-first sort
  puts side by side. Ordered by `break-even.md`'s own ranking (what each item
  gates). Exactly one item moves the revenue ceiling off `$0`. Product-code
  merges are not in this file — answered yes on 2026-08-25. Run
  `decision_queue.py` for the current count rather than trusting a number in
  this prose.

  Update it when an ask is granted, withdrawn, or added — not by appending a
  second record for the same ask. `--check` runs in CI and rejects an ask or
  pull request claimed by two decisions, since that is the collapse being wrong.

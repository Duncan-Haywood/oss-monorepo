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

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

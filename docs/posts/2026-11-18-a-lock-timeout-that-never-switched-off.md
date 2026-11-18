---
title: "A lock_timeout that never switched off"
seo_title: "SET LOCAL lock_timeout ends at COMMIT: a migration checker bug"
date: 2026-11-18
tags: [redteam, postgresql, migration, testing]
description: "A red-team run seeded 24 faults into three products, closed every gap, and found the migration lock checker treating lock_timeout as permanent once set."
---

This afternoon's red-team run seeded 24 small faults into three products: the revenue
recognition engine behind [rev-rec](https://marisstella.app/rev-rec/), the
[SQL migration lock check](https://marisstella.app/sql-migration-lock-check/) and the
[propensity score](https://marisstella.app/propensity-score/) estimator. Their own tests caught
15 (68%). Two of the others cannot change anything a user sees. The other seven now each have a
test that catches them, so the catch rate after the fix is 100%. The run also found one real bug.

## The bug: a timeout that stayed on

The migration checker warns when a statement that needs an `ACCESS EXCLUSIVE` lock has no
`lock_timeout` set above it. Without one, a 3 ms `ALTER TABLE` can wait behind one slow `SELECT`,
and every later query on the table queues behind the `ALTER`. The table is down until that `SELECT`
finishes.

The checker kept one flag: "a timeout has been set". Once any `SET lock_timeout` appeared, every
later statement in the file counted as protected. PostgreSQL doesn't work that way:

- `SET LOCAL lock_timeout = '3s'` lasts only until its transaction's `COMMIT` or `ROLLBACK`.
- A `ROLLBACK` undoes a plain `SET` made inside the block.
- `SET lock_timeout = 0`, `TO DEFAULT`, `RESET lock_timeout` and `RESET ALL` all turn it off.

So this migration got a clean result:

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE orders ADD COLUMN note text;
COMMIT;
ALTER TABLE orders RENAME COLUMN note TO memo;  -- no timeout here
```

The second `ALTER` runs with no timeout at all, and that is exactly the statement the check exists
to flag. The code even had a comment saying a `SET LOCAL` "stops applying at COMMIT". Nothing did
that.

The fix tracks three values: the session setting, the `SET LOCAL` override for the current block,
and the session value at `BEGIN`, which a `ROLLBACK` restores. A `SET LOCAL` with no explicit
`BEGIN` in the file still counts for the rest of the file, because Rails, Django and most other
runners wrap each migration in their own transaction. Seven new assertions cover the cases above.
The fix makes the checker stricter, so on a file that used to pass it can only add findings, never
hide one.

## What the tests missed

| Product | Caught | Gaps closed | Equivalent |
|---|---|---|---|
| rev-rec `revrec.mjs` | 7 of 8 | 0 | 1 |
| sql-migration-lock-check `engine.mjs` | 5 of 8 | 3 | 0 |
| propensity-score `engine.mjs` | 3 of 8 | 4 | 1 |

The propensity score gaps were the most interesting. The normal quantile function had one test, at
0.975, which is the 95% interval and falls in the central branch of the approximation. Pick a 99%
interval and the code uses the upper-tail branch, which no test touched. Breaking that branch's
formula outright passed the suite. The page also reports "N of M controls" in its summary, and
replacing the control count with treated plus total passed too, because only the treated count was
asserted. Both are pinned now, along with the standard error for matching with replacement when
there are exactly two pairs.

The rev-rec engine, which turns Stripe invoices into a deferred revenue schedule, came out best:
only one fault got through, a `<` turned into `<=` on a credit note's amount. That change only
matters for a zero-amount credit, which spreads nothing whatever period it gets.

The full record, with every fault and its triage, is in
`prompts/runs/2026-11-18-session_01EhTJVNH52Tusvst6vNPdV6.json`.

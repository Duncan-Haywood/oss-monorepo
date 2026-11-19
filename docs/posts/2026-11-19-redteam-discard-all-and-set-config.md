---
title: "Two ways to set lock_timeout that the lock checker did not see"
seo_title: "DISCARD ALL and set_config: a migration linter red-team find"
date: 2026-11-19
tags: [redteam, testing, postgresql, migration, lock_timeout]
description: "20 faults seeded in the PostgreSQL migration lock checker, 16 caught; DISCARD ALL and set_config() changed lock_timeout unseen. All fixed."
---

This red-team run went after the
[PostgreSQL migration lock checker](https://marisstella.app/sql-migration-lock-check/).
It reads a migration file and flags any statement that can stall production traffic
behind a lock. One of its checks, `no-lock-timeout`, asks a single question: when an
`ALTER TABLE` takes an ACCESS EXCLUSIVE lock, is a `lock_timeout` in force at that
point? If one isn't, a blocked `ALTER` waits forever, and every query queued behind it
waits too.

## The seeded faults

20 small faults went in, one at a time, 10 in the engine (`engine.mjs`) and 10 in the
SQL splitter (`sql.mjs`), with the product's tests run after each. The tests caught 16.
Of the 4 that got through:

- **Two were real gaps, now covered by tests.** Changing the seconds-to-milliseconds
  factor from 1000 to 1001 changed nothing the tests checked. Neither did quoting a
  statement of exactly 160 characters with an ellipsis instead of in full. The new tests
  check that `'0.0005s'` counts as off (PostgreSQL rounds it to 0 ms), that `'0.0006s'`
  counts as on, and where the 160-character quote limit cuts off.
- **Two were equivalent**, meaning the fault could not change any output. To check, the
  same 20,000 generated inputs (unterminated strings, dollar quotes, comments) were run
  with and without each fault, and every output matched. The code says why: the
  masking helper is never passed an end past the text, and the line counter is never
  started on a newline.

## The real bugs

While reading the code the way an attacker would, two ways of changing `lock_timeout`
turned out to be invisible to the checker:

```sql
SET lock_timeout = '3s';
DISCARD ALL;                -- resets every setting, lock_timeout included
ALTER TABLE users RENAME COLUMN a TO b;   -- checker said: protected
```

`DISCARD ALL` does what `RESET ALL` does, and the checker already treated `RESET ALL` as
turning the timeout off. Missing `DISCARD ALL` meant a false all-clear, which is the
more dangerous of the two kinds of mistake for this tool.

```sql
SELECT set_config('lock_timeout', '3s', false);
ALTER TABLE users RENAME COLUMN a TO b;   -- checker said: no lock_timeout
```

`set_config(name, value, is_local)` is the function form of `SET`. With
`is_local = true` it acts like `SET LOCAL` and ends at `COMMIT`. The checker only knew
the keyword form, so a migration that set its timeout this way got a false finding on
every exclusive statement below it.

Both are fixed. Each fix has a test that failed first: `DISCARD PLANS` still leaves the
timeout alone, `set_config` on another setting still doesn't count, and
`set_config(..., true)` stops applying at `COMMIT`.

## Numbers

| | before | after |
|---|---|---|
| seeded faults caught (equivalents excluded) | 16 of 18 (0.889) | 18 of 18 |
| real defects found / patched | 2 / 0 | 2 / 2 |

The tool is MIT-licensed and runs in the browser or as `node check.mjs migration.sql`.
Its findings are estimates of locking behaviour from the SQL text alone. Test a
migration against a copy of your own database before trusting it in production.

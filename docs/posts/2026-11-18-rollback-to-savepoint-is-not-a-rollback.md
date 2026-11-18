---
title: "ROLLBACK TO SAVEPOINT is not a rollback: a migration checker read it as one"
seo_title: "ROLLBACK TO SAVEPOINT keeps the transaction open"
date: 2026-11-18
tags: [sql-migration-lock-check, postgresql, red-team, testing]
description: "Our PostgreSQL migration checker treated ROLLBACK TO SAVEPOINT as the end of a transaction, so a CREATE INDEX CONCURRENTLY that will fail read as clean. Fixed, with tests."
---

[sql-migration-lock-check](../../ventures/sql-migration-lock-check/README.md)
reads a PostgreSQL migration and says which statements can lock a table. Two of
its checks depend on knowing whether a statement sits inside an explicit
transaction block: `CREATE INDEX CONCURRENTLY` fails outright inside one, and a
`NOT VALID` constraint validated in the same block holds its lock for the whole
scan.

Today's red-team run seeded 20 small faults into the checker's splitter and
engine. Its 132 tests caught 13 before and 17 after four new tests; the other
3 change nothing a user can see. Reading the code for real bugs turned up a
bigger one.

## What it got wrong

The splitter decided a block had ended whenever a statement started with
`COMMIT`, `END` or `ROLLBACK`. That misses three things PostgreSQL does:

- **`ROLLBACK TO SAVEPOINT x` undoes work, not the block.** The transaction is
  still open afterwards. The checker closed it, so this migration read clean:

  ```sql
  BEGIN;
  SAVEPOINT before_index;
  ROLLBACK TO SAVEPOINT before_index;
  CREATE INDEX CONCURRENTLY idx ON users (email);  -- PostgreSQL refuses this
  COMMIT;
  ```

  That is the worst kind of miss for this tool: a migration that will abort
  in production, reported as fine.
- **`ABORT` is a synonym for `ROLLBACK`.** The checker didn't know the word, so
  it kept the block open and flagged a correct `CONCURRENTLY` after it.
- **Blocks do not nest.** A second `BEGIN` inside an open block only raises a
  warning, and one `COMMIT` ends the whole thing. The checker counted depth,
  so `BEGIN; BEGIN; COMMIT;` left it thinking a block was still open.

`COMMIT AND CHAIN` (PostgreSQL 12 and later) goes the other way: it commits
and opens a new block at once, so the next statement is still inside one.

## The fix

One function, `transactionEffect` in `sql.mjs`, now classifies a statement as
opening, closing or chaining a block, or as none of these (savepoints and
two-phase `COMMIT PREPARED` count as none). Both the splitter and the engine
use it, so they can't drift apart again. Each of the cases above has a test
that failed before the change.

## Running it on our own migrations

We also ran the checker over the five Prisma migrations in this repository.
It flagged a plain `CREATE INDEX` and two `ADD COLUMN` statements with no
`lock_timeout`. Those migrations ran long ago on small tables, and editing an
applied Prisma migration breaks its checksum, so they stay as they are. The
next migration we write should set `lock_timeout` and build indexes
`CONCURRENTLY`.

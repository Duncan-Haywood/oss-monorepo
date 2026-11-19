---
title: "A comment hid the lock_timeout, and '0h' passed for a real one"
seo_title: "PostgreSQL lock_timeout '0us' and a comment above SET: two checker bugs"
date: 2026-11-19
tags: [redteam, testing, postgresql, migration]
description: "24 faults seeded in a PostgreSQL migration lock checker, 18 caught; two real bugs in how it reads SET lock_timeout, one a false alarm and one a false all-clear."
---

The [SQL migration lock checker](https://marisstella.app/sql-migration-lock-check/) reads a
PostgreSQL migration and warns about statements that can block a table. One of its most useful
warnings is `no-lock-timeout`: an `ALTER TABLE` or `DROP TABLE` with no `SET lock_timeout` above
it can wait behind one slow query, and every query that arrives after it waits too. This
red-team run seeded faults in the engine and the statement splitter, then read the code that
decides whether a timeout is in force, looking for inputs that fool it.

## Two real bugs in one function

**A comment above the `SET` hid it.** The function that spots `SET lock_timeout` read the raw
statement text, comments included. Statements are split at semicolons, so a comment on the line
above becomes the start of the next statement:

```sql
-- give up fast rather than queue
SET lock_timeout = '3s';
DROP TABLE t;
```

That statement starts with `--`, the pattern for a `SET` did not match, and `DROP TABLE` got a
`no-lock-timeout` risk on a migration that had done exactly what the warning asks for. A
false alarm on the correct migration is the kind of finding that teaches people to ignore the
tool. The fix reads the statement with its comments removed and its string literals kept. The
splitter already builds that text to quote statements back to the user.

**Zero written another way read as a real timeout.** `lock_timeout = 0` turns the timeout off.
That is PostgreSQL's default and the dangerous setting. The checker knew `0`, `0ms`, `0s` and
`0min`. PostgreSQL also accepts `us`, `h` and `d` as units, and `00` and `'0.0'` as numbers.
All of these set the timeout to zero, and the checker took every one as a live timeout, so it
gave a clean result to a migration with no timeout. The same goes for anything under half a
millisecond: lock_timeout is a whole number of milliseconds, PostgreSQL rounds a fraction to
the nearest one, and so `'400us'` is 0. The fix parses the number and the unit, converts to
milliseconds, and counts the timeout as on only above 0.5 ms. A value it cannot parse still
counts as on, as before: PostgreSQL rejects a malformed value anyway, so guessing "off" would
only add false alarms.

Both fixes went in with failing tests first: four comment placements, and fourteen spellings
of "off" against ten of "on".

## The seeded faults

The campaign seeded 24 faults, 12 in each file, and ran the product's tests after each one. 18
were caught (75%). Of the six that got through, three could never change any output once
traced: a `TRUNCATE` line in a helper that the `TRUNCATE` branch never reaches, a loop bound
that the helper it feeds already caps, and an off-by-one that reads past the end of the string,
where there are no newlines to count. The other three were real gaps in the splitter. All three
were boundary cases: an `E'...'` string after a keyword and a space (`SELECT E'it\'s'`), a name
ending in `e` right before a quote at the third character of the file, and a quoted identifier
that opens with an escaped quote (`"""a"`). One new test each closed them. With the three
equivalents set aside, the catch rate was 18 of 21 before (86%) and 21 of 21 after.

## What to take from it

A checker that reads SQL text has to find the same setting in every form the database accepts.
Here that meant every unit, every number format, and a comment in any position. Unit tests
written alongside the rule used the spelling the author had in mind, so they missed the other
ones. The useful attack question is "how else can PostgreSQL be told this?", asked of every
value the tool reads.

The checker is free and MIT licensed, runs in the browser or as a zero-dependency CLI, and
never connects to a database. A clean result means its listed checks found nothing. It is not a
review of the migration.

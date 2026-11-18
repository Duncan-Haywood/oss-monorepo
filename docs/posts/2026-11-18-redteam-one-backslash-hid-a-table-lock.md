---
title: "One backslash hid a table lock: red-teaming a migration lock checker"
seo_title: "PostgreSQL E'' strings and $ in names: how a SQL splitter goes blind"
date: 2026-11-18
tags: [redteam, testing, postgresql, migration]
description: "20 faults seeded in a PostgreSQL migration lock checker, 17 caught; reading the scanner as an attacker found two inputs that hid every statement after them."
---

The [SQL migration lock checker](https://marisstella.app/sql-migration-lock-check/) reads a
PostgreSQL migration and flags statements that take a lock for longer than you expect, such as a
`CREATE INDEX` without `CONCURRENTLY`. Before it can check anything it has to split the file into
statements, and that means deciding which characters are code and which sit inside a string or a
comment. This red-team run tested that scanner.

## The seeded faults

The run seeded 20 small faults, one at a time, into the engine and the splitter, and ran the
product's own tests after each one. 17 broke a test. The engine caught all 10 of its faults.
Of the three that got through in the splitter, two could not change any output: an off-by-one at
the very end of the input reads `undefined`, which joins as an empty string. The third flipped
which characters get marked as "inside a string" in an exported mask that no test read. One new
test closes that gap, and the rerun confirms the test catches the fault.

## Two real bugs, both silent

Reading the scanner as an attacker found two inputs that make it go quiet.

**An escaped quote in an `E''` string.** PostgreSQL's `E'...'` strings take C-style backslash
escapes, so `E'it\'s'` is one string. The scanner knew only the standard `''` escape, so it took
`\'` as the end of the string and read the next quote as the start of a new one. That string never
closed, so the scanner treated the rest of the file as text:

```sql
UPDATE accounts SET note = E'it\'s';
CREATE INDEX accounts_email ON accounts (email);  -- no finding
```

The `CREATE INDEX` here blocks writes to `accounts` for the whole build, and the checker said
nothing. A wrong finding costs a reader's trust, but a missing finding costs an outage.

**A dollar sign inside a name.** PostgreSQL allows `$` after the first character of an unquoted
identifier, so `a$b$c` is one name. The scanner read `$b$` as the opening tag of a dollar-quoted
body, never found a closing `$b$`, and blanked the rest of the file the same way. Names like that
are uncommon, but Oracle allows them too, so they turn up in ported schemas.

Both fixes are a few lines in `sql.mjs`. An `E` or `e` right before the quote (and not at the end
of a longer name) turns on backslash escapes, `\\` included. A `$` right after an identifier
character continues the name. Tests for both failed before the fix and pass after it, and the
product's 155 tests pass.

## What this says about the tests

The suite caught 85% of the seeded faults (17 of 20). Both real bugs were still there, because a seeded fault only tests the code that already exists. Neither
bug was a wrong line. In each case the scanner was missing a rule, and the only way to find a
missing rule is to read the PostgreSQL lexer's rules next to the scanner's.

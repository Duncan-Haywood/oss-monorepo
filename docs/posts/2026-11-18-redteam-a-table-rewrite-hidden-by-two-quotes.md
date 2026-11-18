---
title: "A table rewrite hidden by two pairs of quotes"
seo_title: "Quoted schema names hid a table rewrite from a migration checker"
date: 2026-11-18
tags: [redteam, testing, postgresql, migration]
description: "A red-team run on the PostgreSQL migration lock checker caught 29 of 38 seeded faults and found a quoted schema name hiding a full table rewrite."
---

Today's red-team run aimed at the
[PostgreSQL migration lock checker](https://marisstella.app/sql-migration-lock-check/). It reads a
migration file and points out the statements that can lock a table while it runs. The run seeded 38
small faults into its engine, its statement splitter and its CLI, and ran the tool's own tests after
each one. 29 broke a test. Of the 9 that got through, 4 now have a test that catches them. The other
5 change nothing a user can see. The run also found five real bugs while reading the code as an
attacker. All five are fixed.

## The worst one: two pairs of quotes

The splitter blanks out comments and string literals so that a `CREATE INDEX` inside a comment
can't produce a finding. It also keeps quoted identifiers such as `"users"` as code, and replaces
the quote marks with spaces. That is fine for `"users"`. A schema-qualified name breaks it:

```sql
ALTER TABLE "public"."users" ALTER COLUMN "email" TYPE bigint;
```

After masking, that reads `public . users`. That's three tokens, and every check's name pattern
expects one. The column-type check never matched, so the tool reported nothing for a statement that
rewrites every row under an exclusive lock. Without the quotes, `public.users`, the same statement
was flagged. `SET NOT NULL` on the quoted form was still flagged, but it named the table `public`.

pg_dump writes names in this quoted, schema-qualified form, and so does any tool that quotes every
identifier. The fix rejoins a dot between two names in the masked text, so every check sees
`public.users`.

## Four smaller ones

- **`DROP INDEX CONCURRENTLY` got a false warning.** The README says it is one of the safe forms
  and isn't flagged. The engine still called it an exclusive lock and asked for a `lock_timeout`.
  It takes SHARE UPDATE EXCLUSIVE.
- **Three ACCESS EXCLUSIVE statements went unflagged.** `REFRESH MATERIALIZED VIEW` (without
  `CONCURRENTLY`), `DROP MATERIALIZED VIEW` and `LOCK TABLE` (whose default mode is ACCESS
  EXCLUSIVE) were never flagged for a missing `lock_timeout` and never counted toward the "several
  locks in one transaction" check.
- **Plain `DROP INDEX` skipped the lock accounting.** It had its own finding, but that branch
  returned early, so `BEGIN; DROP INDEX i; TRUNCATE b; COMMIT;` didn't count as two exclusive locks
  held together.
- **`public.t` and `t` were different tables.** The tool stays quiet about indexes on a table the
  same file just created. `CREATE TABLE public.t` followed by `CREATE INDEX ... ON t` still got a
  warning. `ON ONLY t` also read the table name as `ONLY`.

## The faults that got through

- **VACUUM FULL.** A test checked that `VACUUM FULL` gets the full-rewrite finding, but none checked
  that it also needs a `lock_timeout`. One now does.
- **CLI output.** The heading's 88-column wrap and the two-space JSON indent had no exact test, so
  changing either went unnoticed. Two tests now pin them.
- **Five equivalent faults.** Five survivors in the splitter and the timeout tracker can't change
  the output. Examples are an off-by-one past the end of the text that is clamped one line later,
  and a field nothing reads. The record says why for each.

The catch rate went from 76% to 87% of the faults seeded. The remaining 13% are the five equivalent
faults.

---
title: "Our migration checker couldn't see inside DO blocks, and drizzle-kit puts every foreign key in one"
date: 2026-11-20
tags: [sql-migration-lock-check, ventures, postgresql, redteam]
seo_title: "Our migration checker missed DDL inside PostgreSQL DO blocks"
description: "SQL Migration Lock Check called DDL inside DO $$ ... $$ clean, including every foreign key drizzle-kit generates. What went wrong and the fix."
---

[SQL Migration Lock Check](https://marisstella.app/sql-migration-lock-check/)
reads a PostgreSQL migration and tells you which statements can lock a table:
a `CREATE INDEX` without `CONCURRENTLY`, an `ADD CONSTRAINT` that scans every
row, an `ALTER TABLE` with no `lock_timeout` above it. It reads text only, with
no database connection.

Today's red-team run fed it inputs a stranger might send. One came back wrong,
and it was a common one:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx') THEN
    CREATE INDEX idx ON users (email);
  END IF;
END
$$;
```

Verdict: **clean**. That `CREATE INDEX` blocks every write to `users` until it
finishes, which is exactly what the tool exists to catch.

## Why

The checker masks string literals before matching, so `'ALTER TABLE'` inside
a quoted string never reads as a statement. A `DO` body is a dollar-quoted
string (`$$ ... $$`), so it was masked too, along with everything inside it.

It matters more than it looks. drizzle-kit, a popular TypeScript ORM's
migration generator, writes every foreign key like this:

```sql
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

On an existing table, that `ADD CONSTRAINT` checks every row while holding a
lock that blocks writes to both tables. The usual fix is to add it `NOT VALID`
and run `VALIDATE CONSTRAINT` as a separate step. Before today, the tool said
nothing about it.

## The fix

The body of a `DO` block is PL/pgSQL, not plain SQL, so the checker can't just
treat it as a migration file. It now:

1. splits the body at semicolons, and also after the control words that run
   straight into a statement (`BEGIN`, `THEN`, `ELSE`, `LOOP`, `EXCEPTION`),
   but only outside parentheses, so `CASE WHEN a THEN 1 ELSE 0 END` inside a
   generated column stays whole;
2. drops the pieces that are control flow (`IF`, `END IF`, `RAISE`,
   `WHEN duplicate_object THEN null`);
3. checks what is left at its real line number, as if it ran inside one
   transaction, because a `DO` block does.

Point 3 gets two more cases right. `CREATE INDEX CONCURRENTLY` inside a `DO`
block fails at runtime, and is now reported. Two exclusive locks in one block
are held together until it ends, and are now reported as such.

The rule that keeps the tool quiet still applies: a statement against a table
created earlier in the same file has no existing rows to lock. So a drizzle
initial migration that creates `posts` and then adds the foreign key still
comes back clean, and the same foreign key added to an existing table comes
back as a risk. Both cases are tests now.

One limit: dynamic SQL (`EXECUTE format('ALTER TABLE %I ...', name)`) is not
followed, because the statement doesn't exist until it runs.

## How well do its tests catch bugs?

Same run: 22 deliberate faults planted in the parser and the rule engine, one
at a time. The existing tests caught 18. Two of the four that got through
could not change any output (one extra loop pass over an undefined
character). The other two were real gaps: a string holding only a quote
(`''''`) could swallow the statements after it, and the hour unit of
`lock_timeout` was never tested at its rounding edge. Each has a test now, so
after the fix the catch rate is 20 of 20 for faults that can change an answer.

The checker is free and MIT licensed: paste a migration at
[marisstella.app/sql-migration-lock-check](https://marisstella.app/sql-migration-lock-check/),
or run `node check.mjs --fail-on-risk` in CI. It is an aid to review, not a
guarantee, and it doesn't replace testing a migration on a copy of production
data.

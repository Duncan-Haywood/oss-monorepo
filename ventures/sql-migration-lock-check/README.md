# sql-migration-lock-check

**Will this migration lock the table and take the app down?**

A zero-dependency CLI and a browser tool that read a PostgreSQL schema
migration and report every statement that can take a blocking lock or rewrite
a table.

It reads SQL text and nothing else — no connection string, no credentials, no
driver, no network call of any kind. That is what makes it safe to run against
the migration you are about to apply to production: there is no connection to
point at the wrong database.

- **Browser tool:** <https://duncan-haywood.github.io/monorepo-projects/sql-migration-lock-check/>
- **Guide:** [why your migration locked the table](./why-your-migration-locked-the-table.html)
- **Comparison:** [vs. squawk](./vs-squawk.html)

## Use it

```
node check.mjs                     # scan every .sql under the current directory
node check.mjs db/migrate          # scan one directory or one file
node check.mjs --format json       # machine-readable
node check.mjs --list-checks       # exactly what is checked, and at what severity
node check.mjs --fail-on-risk      # exit 2 if a statement can block the table
```

Three files, Node 18+, nothing to install: `check.mjs`, `engine.mjs`,
`sql.mjs`. Exit codes are `0` (no findings, or findings without
`--fail-on-risk`), `1` (a path could not be read, or a bad argument) and `2`
(`--fail-on-risk` and at least one risk-level finding).

## The wedge: four relational checks

Most of the fifteen checks are the ones you would expect. Four are not
available to a per-statement linter at all, because the answer depends on
another statement in the file:

| Check | Why a statement-at-a-time rule cannot see it |
|---|---|
| `no-lock-timeout` | Whether an exclusive-lock statement is protected depends on whether a `SET lock_timeout` appears **above** it. |
| `validate-in-same-transaction` | `ADD CONSTRAINT ... NOT VALID` and `VALIDATE CONSTRAINT` are each individually correct and idiomatic. Together inside one `BEGIN` block they hold the lock for the whole validation, so the two-step split buys nothing. |
| `create-index-concurrently-in-tx` | `CREATE INDEX CONCURRENTLY` is the *fix* — unless it sits inside a transaction block, where PostgreSQL refuses it outright. |
| `set-not-null-full-scan` | On PostgreSQL 12+ this is either a metadata change or a full scan under an exclusive lock, and which one depends entirely on whether something earlier added a **validated** `CHECK`. |

The first is the one that matters most in practice. An `ALTER TABLE` needs
`ACCESS EXCLUSIVE`, which conflicts with the `ACCESS SHARE` a plain `SELECT`
holds. If any query is still running on the table, the migration waits — and
because PostgreSQL will not let a weaker lock request jump ahead of a stronger
one already queued, *every later query on that table queues behind it too*. A
3ms statement takes the table down for as long as one forgotten slow `SELECT`
runs. `SET lock_timeout = '3s'` converts that from an outage into a migration
that fails and can be retried.

## What it deliberately does not flag

A checker that cries wolf gets skipped, and then its true findings are worth
nothing either. So:

- **`ADD COLUMN ... DEFAULT <constant>`** — metadata-only since PostgreSQL 11.
  Only a **volatile** default rewrites the table, so `DEFAULT now()` (STABLE)
  is quiet and `DEFAULT gen_random_uuid()` (VOLATILE) is not.
- **`VALIDATE CONSTRAINT` on its own** — takes `SHARE UPDATE EXCLUSIVE`, which
  is the entire reason the `NOT VALID` split works. Demanding a `lock_timeout`
  for the one `ALTER TABLE` form that does not need one would undercut the
  advice two other checks give.
- **`REINDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY`, `CREATE INDEX
  CONCURRENTLY`** outside a transaction — these are the fixes.
- **Anything against a table this file just created.** An initial migration
  indexing a table it created four lines earlier touches no existing rows and
  contends with nothing.
- **`SET NOT NULL` behind a validated `CHECK`** — the PostgreSQL 12+ fast path.

## What dogfooding caught

Run against this repository's own Prisma migrations
(`ventures/quick-pick-survey/prisma/migrations`), the first draft reported
**72 findings**. Reading them found two defects in *this tool*, not two in the
migrations:

1. **The quoted statement included its own leading comment.** Generated
   migrations put a comment above every statement, so a correct finding
   rendered as `-- CreateIndex CREATE UNIQUE INDEX ...` — which reads as
   commented-out code and makes the tool look broken. Fixed by tracking
   comment spans separately from string literals, so the quoted SQL drops
   comments and keeps literals.
2. **Almost every one of the 72 was a `CREATE INDEX` on a table created a few
   lines above it.** That is what an initial migration looks like, and there
   are no rows to lock. Fixed with the new-table rule above.

The same run now reports **exactly 1 finding**, and it is a true positive: a
later migration adds an index to the pre-existing `Participant` table without
`CONCURRENTLY`.

That 72-to-1 correction is the argument for shipping a checker against files
you actually have. Both defects were invisible in unit tests written by the
same person who wrote the checks, because both were about how a *real* file is
shaped rather than about whether a rule fires.

## Scope and limits

**PostgreSQL.** The lock levels, rewrite rules, the `NOT VALID` /
`VALIDATE CONSTRAINT` split and the `CONCURRENTLY` forms are PostgreSQL
semantics. MySQL has its own online-DDL rules and SQLite rewrites tables for
most `ALTER`s regardless, so read the reasoning rather than the verdict if you
point it at either.

**A clean result is not a review.** It cannot see your table sizes, your
traffic, how long your existing queries run, what your migration runner does
around the file, whether an application-side backfill is batched, or whether
the change is backwards compatible with the app version still running during a
rolling deploy. Every fast path it relies on is also version-gated — verify
against the PostgreSQL version you actually run.

## Layout

| File | What it is |
|---|---|
| `sql.mjs` | Statement splitter: comments (nesting block comments included), string literals, dollar-quoted bodies, transaction depth |
| `engine.mjs` | The fifteen checks. Pure functions over text; no I/O |
| `check.mjs` | CLI |
| `usage.mjs` | Anonymous local-storage feature counts, opt-out, DNT/GPC honoured |
| `index.html` | Browser tool, running the same engine |

Tests: `node --test ventures/sql-migration-lock-check/*.test.mjs` (109
assertions across the splitter, the engine, the CLI, the page and the usage
module).

## Privacy

Nothing is uploaded. The browser page parses what you paste on your own
device; the CLI reads files from your own disk. No accounts, no cookies, no
analytics vendors. Anonymous feature counts (`check_run`, `example_loaded`)
live in this browser's local storage only, can be deleted from the page, and
are not recorded at all if Do Not Track or Global Privacy Control is set.
`usage.test.mjs` asserts that no network primitive appears anywhere in the
usage module.

## Licence

MIT — see [LICENSE](./LICENSE).
[Sponsorship](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.

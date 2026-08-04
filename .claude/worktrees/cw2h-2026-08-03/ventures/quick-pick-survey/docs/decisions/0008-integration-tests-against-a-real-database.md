# 0008. Test the routes against a real database

**Status:** accepted — supersedes the environment premise of
[0004](0004-no-database-in-ci.md)

## Context

[0004](0004-no-database-in-ci.md) treated "no database" as a permanent
property of the development environment and designed around it: logic in
`src/lib`, handlers kept thin, and anything touching Postgres verified by hand
before merge. It named the condition for reversing itself precisely — *a
service container **and** a documented way for a sandboxed agent to get the
same database; adding only the first is worse than adding neither.*

The premise turned out to be false, and cheaply so. The agent sandbox this
project is mostly written in ships PostgreSQL 16. Two things hid it:

- Only the client is on `PATH`. On Debian and Ubuntu the server binaries live
  in `/usr/lib/postgresql/<version>/bin`, so `which pg_ctl` finds nothing while
  `psql` is right there.
- Sessions run as root, and `initdb` and `postgres` both refuse to run as root.
  The failure looks like a policy refusal, not a missing dependency.

Both are three lines of shell to handle. Meanwhile the cost of the gap was
concentrated in exactly the places the project cares most about: the
transactional claim in `trials/answer`, the participant reuse in
`session/start`, and the boundary in `couple/compare` across which a partner's
raw answers must never travel. Each was "verified by hand once", which is not a
property of the code, only of an afternoon.

Those are also the properties a unit test with a mocked Prisma client cannot
reach. A mock can prove a handler *called* `updateMany` with a `result: null`
guard. Only a database can prove that two requests racing on that call apply
one rating update rather than two.

## Decision

Add a second Vitest project, `src/**/*.integration.test.ts`, that imports the
real route handlers and runs them against a real Postgres, and make getting
that Postgres a single command that works in an agent sandbox and on a laptop
alike:

    scripts/test-db.sh start
    npm run test:integration

`scripts/test-db.sh` searches for the server binaries when they are not on
`PATH`, drops to the `postgres` system user when running as root, and puts the
cluster somewhere that user can traverse to. CI runs the same suite against its
existing Postgres service container by setting `POSTGRES_PRISMA_URL`.

0004's engineering advice stands and is unchanged: handlers stay thin, logic
stays pure and injectable in `src/lib`, and the unit suite stays the fast gate
that runs anywhere. `npm test` still needs no database. What changes is that
"nobody can run the routes" is no longer a fact to design around.

## Consequences

- The three paths the product rests on — answering, resuming, and comparing two
  people — are covered by 27 tests that fail if the database stops behaving the
  way the code assumes. Concurrency claims in particular are now asserted
  rather than reasoned about.
- The gate is now two commands, and the second can fail for an environmental
  reason rather than a code one. `globalSetup` turns that into one sentence
  naming the command to run, instead of forty connection errors.
- `npm run verify` deliberately does **not** include it. A gate that cannot run
  without setup is a gate people route around; keeping the fast one fast and
  the slow one explicit is what stops that.
- Integration tests can drift into re-testing the pure functions underneath
  them, which is slower and proves less. The rule of thumb in
  [TESTING.md](../TESTING.md): plant the state when the state is not what you
  are testing.
- If a future environment genuinely has no Postgres, the suite skips with an
  instruction and the fast gate is unaffected — which is the same position
  0004 left the project in, rather than a worse one.

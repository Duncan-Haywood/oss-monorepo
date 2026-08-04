# 0004. Accept no database in CI; keep logic out of route handlers

**Status:** partly superseded by
[0008](0008-integration-tests-against-a-real-database.md)

Its premise — that no database is reachable from the environments this project
is developed in — was wrong: the agent sandbox ships PostgreSQL 16, with the
server binaries off `PATH` and `initdb` refusing to run as root, which is why
it read as absent. The condition this record itself set for reversing (a
service container **and** a documented way for a sandboxed agent to get the
same database) is now met by `scripts/test-db.sh`.

Everything below about handler design still holds, and the reasoning is kept
because the shape of the mistake is the useful part: an environment was
declared impossible without anyone running `ls /usr/lib/postgresql`.

## Context

A CI workflow exists on GitHub Actions, and much of the work on this repo is
done by coding agents in sandboxes with no Docker daemon and no Postgres
server. Neither environment can run the app end to end.

(Since this was written it has emerged that the workflow has never actually
started a runner — see the P1 entry in `IMPROVEMENT-PLAN.md`. That makes the
decision below more load-bearing, not less: `npm run verify` run locally is
currently the *whole* of the gate.)

The usual answer is a service container in CI plus a seeded test database.
That would cover the API routes, but it would not help the agent sandboxes
at all — and those are where most changes are actually written and where a
confident, unverified refactor does the most damage. Half a solution here
would produce the worst outcome: a green pipeline that implies coverage the
day-to-day workflow does not have.

## Decision

Treat "no database" as a permanent property of the development environment
and design around it.

- Route handlers parse input, call something in `src/lib`, and serialise the
  result. Nothing else.
- Logic lives in `src/lib`, pure and injectable, and is tested there.
- Components are tested against a stubbed `fetch`, so UI behaviour is
  covered without a server.
- Anything that touches the database is not done until a human has run it
  against a local Postgres, and the pull request says which.

## Consequences

- The gate (`npm run verify`: typecheck, lint, test, build) is fast, runs anywhere,
  and never flakes on a container that would not start.
- Almost every API route is uncovered by automation — `session/start` is the
  one exception, and it is covered only for the input it refuses. This is the
  known, accepted hole. It is why the pull request template asks explicitly
  what was verified and what was not.
- There is real pressure to keep handlers thin, which has been good for the
  codebase independently: `couples.ts`, `pairing.ts` and `insights.ts` are
  all testable because the logic was pushed out of the routes.
- If this is ever reversed, the thing to add is a service container **and**
  a documented way for a sandboxed agent to get the same database. Adding
  only the first is worse than adding neither.

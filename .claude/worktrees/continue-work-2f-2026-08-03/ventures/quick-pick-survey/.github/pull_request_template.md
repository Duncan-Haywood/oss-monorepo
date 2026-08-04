<!--
Kept short on purpose. The point of each section is to say the thing a
reviewer (or you, in three months) can't recover from the diff.
See developmentprocess.tsx for the definition of done.
-->

## What changed

<!-- One or two sentences. What a user would notice, or what a maintainer would. -->

## Why

<!-- The problem this solves. If it's a bug, what did it do wrong and when? -->

## How it was verified

<!--
`npm run verify` is the floor, not the answer. Say what you actually
exercised — which tests were added, what was tried by hand, and what
could not be verified and why.

A database is available anywhere the Postgres binaries are, including an
agent sandbox: `scripts/test-db.sh start`. "Not verified against a database"
now needs a reason.
-->

- [ ] `npm run verify` passes (typecheck, lint, test, build)
- [ ] Touches a route, a query or the schema? `npm run test:integration` passes
- [ ] New behaviour has a test, or the reason it can't is written down below

## What this does not cover

<!-- Known gaps, follow-ups, anything deliberately left for later. Link an
IMPROVEMENT-PLAN.md entry if there is one. -->

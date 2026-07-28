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
could not be verified because there is no database in the sandbox.
-->

- [ ] `npm run verify` passes (typecheck, lint, test, build)
- [ ] New behaviour has a test, or the reason it can't is written down below

## What this does not cover

<!-- Known gaps, follow-ups, anything deliberately left for later. Link an
IMPROVEMENT-PLAN.md entry if there is one. -->

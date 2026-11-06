# Pages tests: build.test.mjs warm reading, and a red catch-all bound (2026-11-06)

Follow-up to `pages-test-perf-2026-11-05-determinism-warm.md`, item 1.

## Reading

`node --test build.test.mjs` in `platform/pages`, 4-core sandbox, with
`PAGES_CARD_CACHE` set, run twice in a row:

- Cold card cache: 270.7 s (4m30s wall), 305 tests.
- Warm card cache: 154 s (2m34s wall).

So the 298 s in backlog P062 is the cold figure and overstates the CI cost by
about 1.9x when the cache hits. No code change to the test file's speed.

## Finding: main was red

Both runs failed one test, `the catch-all holds only what no section claims`:
six ventures fell through every category rule (`agentic-trading-lab`,
`persona-conversation-simulator`, `price-drop-watcher`,
`stranded-branch-finder`, `vsme-report-builder`, `world-clock-widget`) against
a bound of 5. A red `Test the site builder` job re-runs the whole ~9 min step
for every PR, so this is a pool cost as well as a correctness one.

Fix: `stranded-branch-finder` joins `ci` (a maintainer's developer gate) and
`vsme-report-builder` joins `backoffice` (compliance paperwork). The catch-all
is back to 4. Verified with `--test-name-pattern='catch-all|named category'`:
3 pass, 0 fail.

## Not changed (ranked)

1. Compare `ci_profile.py` "Test the site builder" minutes once CI card-cache hit
   rate is known.
2. The four remaining catch-all members have no obvious home; the next arrival
   should enumerate again rather than raise the bound.

# Change-order diff for wall-framing-takeoff (2026-11-01)

Added `ventures/wall-framing-takeoff/compare.mjs` (`budgetDiff`, `diffText`) and CLI `--compare=revised.json`.
For the next run: it takes two budget() results, so any new budget line is compared for free. Not done: a page card, and diffing schedules (finish date change from a design change).
Checks: `node --test compare.test.mjs cli.test.mjs budget.test.mjs` all pass (62 in the last two plus 5 new).

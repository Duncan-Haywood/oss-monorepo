---
title: "The green test suite that ran half its tests"
seo_title: "node --test --test-force-exit silently drops tests on Node 22"
date: 2026-11-13
tags: [ci, performance, node, testing]
description: "Splitting a slow test file showed that node --test with --test-force-exit was ending files early with exit 0. 641 tests became 587 and nothing failed."
---

This was meant to be a routine speed-up. The
[changepoint detector](../../ventures/changepoint-detector/)'s test suite is the
slowest of the ventures we touch most. It has 157 files and takes 255 seconds
on four cores. One file, `engine.test.mjs`, takes 166 of those seconds on its
own. `node --test` runs three files at a time, so that one file decides when
the suite finishes.

The fix was dull and exact: move its nine slowest tests, all about bends in a
trend line, unchanged into two new files. Three files of about a minute each
replace one of nearly three.

Then the numbers came back wrong. Before the split, the suite reported 641
tests. After it, 587, with nothing failed and exit 0. Fifty-three tests were
simply not there.

## The split did not lose them

Run on its own, the file passed 85 of 85. Run on its own with the flag our CI
runner passes, `--test-force-exit`, it reported 43. A second time, 38. The
unsplit file on `main` reported 94, then 42. Each run stopped at a different
test, without an error and without a failure, with a tidy summary that added
up.

A 60-test file with nothing in it but busy loops shows the same thing on
Node 22.23:

| command | tests reported |
|---|---|
| `node --test --test-force-exit` | 39, 54 |
| `node --test` | 60, 60, 60 |
| `node --test-force-exit file` | 60, 60 |

The flag is meant to end the process once every test has finished, even if a
stray server keeps the event loop alive. In the test runner's multi-file mode
it sometimes ends a file before every test has run.

## Why the flag was there

A day earlier, a red-team run found that about 40 server test files close their
server on a test's last line. When an assertion fails, the close is skipped, the
open server keeps Node alive, and CI waits 20 minutes for a timeout. The flag
fixed that, and a check on one suite with short tests showed no tests lost.
That check was honest, but it could not catch a bug that only shows up with
long tests.

## The fix

The runner no longer passes the flag. It handles the hung server itself: it
reads the output as it arrives, and if a suite has already printed `not ok`
and then goes ten seconds without printing anything, it stops the suite. Only a
suite that has already failed can be stopped early, so no failure can turn green
and no test can go missing from a passing run. A new test checks that a 40-test
file with slow tests reports all 40.

## What it bought

The changepoint suite now runs 641 of 641 tests in 214 seconds instead of 255.
The bigger gain is that a green check again means every test ran.

The measurements and the ranked list for next time are in
[`ci-perf-2026-11-13-changepoint-engine-test-split.md`](../history/ci-perf-2026-11-13-changepoint-engine-test-split.md).

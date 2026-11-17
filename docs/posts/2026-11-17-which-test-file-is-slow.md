---
title: "Which test file is slow, and has anyone looked before?"
seo_title: "Timing each test file alone to pick a CI speed-up target"
date: 2026-11-17
tags: [process, ci, performance]
description: "The suite-time table named the slow suite, not the slow file, and hid that the top three had 16 to 25 speed-up passes. One command now shows both."
---

This repository runs about 1,365 test suites, one per tool. A file,
`venture_suite_times.json`, records how long each took on the last full run,
and the runs that work on test speed start from it. By today it was the
first thing they opened, and their run records kept reporting the same
three gaps:

- **It names a suite, not a file.** One run timed each file in a loop with
  `xargs`. Another wrote its own per-module timer for the `platform/ci` tests.
  Both scripts were thrown away when the run ended.
- **Its times were taken four suites at a time on four cores.** One suite
  listed at 10.0 s took 3.8 s on its own, so the ranking makes small
  suites look slower than they are.
- **It doesn't say who has been there before.** The slowest suite at the
  top of the table has had a lot of attention. One run found its target
  "CPU-bound in tight loops" after five passes. Another got a 7x win in
  minutes from the untouched 10 to 20 s tier.

## What changed

`python3 platform/ci/suite_file_times.py <tool>` runs each test file of one
suite on its own, one at a time by default so the cores are idle, and prints
a table: seconds, tests run, ok or FAIL. It also lists the earlier speed-up
write-ups (`docs/history/ci-perf-*.md`) that name the tool. Any directory
works too, so `platform/ci` is covered.

`run_venture_tests.py --times N` now adds two columns: how many of those
write-ups name each suite, and the date of the latest one. The top of
today's table:

| suite | seconds | perf write-ups | latest |
|---|---:|---:|---|
| league-schedule-generator | 626.8 | 25 | 2026-11-17 |
| shift-roster-builder | 571.0 | 16 | 2026-11-17 |
| shed-designer | 472.0 | 21 | 2026-11-17 |
| changepoint-detector | 152.9 | 23 | 2026-11-17 |
| ... | | | |
| wasserstein-distance | 19.3 | 1 | 2026-11-16 |
| gaussian-process-regression | 17.7 | 2 | 2026-11-14 |

The counts are a rough signal. A write-up that names a suite only in
passing still counts, so read them as "looked at", not "optimised".

## Two readings

On `wasserstein-distance`, one file takes 11.2 of the suite's 12.7 seconds
(`engine.test.mjs`, 21 tests). The other three files take 1.5 s between
them. A speed-up run has one place to look.

On `platform/ci`, the 167 test files take 211.7 s summed and 54 s of wall
time with four at a time. The slowest is `test_run_workflow_locally.py`
at 13.9 s (233 tests). No file takes more than 7% of the total, so this
directory has no single slow file to fix.

The tool, its tests, and the two new columns are in
[`platform/ci/`](https://github.com/duncan-haywood/oss-monorepo/tree/main/platform/ci).

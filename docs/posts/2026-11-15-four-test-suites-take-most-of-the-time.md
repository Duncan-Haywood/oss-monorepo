---
title: "Four of 1,365 Venture Test Suites Take 59% of the Time"
seo_title: "Which Venture Test Suites Are Slowest: A Full Timing Run"
date: 2026-11-15
tags: [ci, performance, testing]
description: "A full timed run of all 1,365 venture test suites: median 0.6 s, but four suites take 2,239 of 3,774 seconds. The times now live in a file."
---

The repository has 1,365 product folders with test suites. Until today nobody had a list of how long each suite takes, so runs looking for a slow suite to speed up had to time them by hand. Two runs yesterday did that and picked suites by how many bytes of test code they had, which turned out to be a poor guide.

So we ran every suite once, four at a time on a 4-core cloud container (`python3 platform/ci/run_venture_tests.py --write-times`), at commit `ab1664ea6`. All 1,365 passed. The whole run took about 16 minutes of wall time.

| | |
|---|---:|
| suites run | 1,365 |
| summed suite time | 3,774 s |
| median suite | 0.6 s |
| suites under 1 s | 1,052 |
| suites at 10 s or more | 23 |
| the four slowest, together | 2,239 s (59%) |

The four slowest:

| venture | seconds |
|---|---:|
| league-schedule-generator | 626.8 |
| shift-roster-builder | 571.0 |
| changepoint-detector | 569.1 |
| shed-designer | 472.0 |

The next six take 40 to 116 s each (ai-bookkeeper, wall-framing-takeoff, clothing-design-studio, einvoice-preflight, open-house-plans, chant-forge). After those, nothing takes more than 20 s.

The slowest one was a surprise. The script's comments, and earlier perf notes, named changepoint-detector as the slowest suite. In this run league-schedule-generator took longer, and shift-roster-builder came close. The four big suites start first and run at the same time, so they compete for the same cores. Their times are good for ranking suites against each other, not as benchmarks of a suite on its own.

The times are saved in [`platform/ci/venture_suite_times.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/platform/ci/venture_suite_times.json), along with the commit, core count and how many suites ran at once. `run_venture_tests.py --times 20` prints the slowest 20 without running anything. `--write-times` with named ventures updates only those rows, so the file can be refreshed one suite at a time after a speed-up.

This matters because CI runs only the suites a change touches. A pull request that changes one of the four big products waits up to ten minutes on that one suite, while most products finish in under a second. Those four suites are where test-speed work will save the most time.

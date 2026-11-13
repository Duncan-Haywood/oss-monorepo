---
title: "One slow test file on four cores: halving a simulation suite without touching the maths"
seo_title: "Halving a simulation suite with worker threads"
date: 2026-11-13
tags: [performance, testing, quick-pick-survey]
description: "The quick-pick-survey simulation suite spent 98 of its 127 seconds waiting on one file. Running that file's six seeded runs on worker threads cut the suite to 66 s, with byte-identical output."
---

Quick Pick Survey ranks a list by asking people to choose between two items at a time. Its claims about how many answers a ranking needs come from simulations: synthetic respondents answer thousands of pairs, chosen by the real selector and scored by the real rating update. Those simulations run in CI on every change to the product, and they were the slowest step outside the site build.

Yesterday's perf run made the selector's inner loop four times faster. That left a different problem, and the per-file timings showed it plainly:

| file | seconds |
|---|---:|
| poolCapDeep4000 | 98 |
| pairMix | 49 |
| poolCapDeep2000 | 25 |
| the other twelve | 53 together |

The test runner runs files in parallel, one file per core. Added up, the files need about 230 CPU-seconds, which on four cores is about a minute. But one file took 98 seconds on one thread, and the suite could not end before it did. For the last half of the run, three cores were idle.

That file runs one "cell": three ways of choosing pairs, two seeds each, 500 items and 4,000 answers per run. The six runs share nothing. Each has its own seed and its own synthetic respondent, so it does not matter which thread runs it, or in what order.

So the change is small. Each run goes to its own worker thread, posts back its two numbers, and the cell takes the medians as before. The simulation code itself is untouched.

## Checking it is the same

A speed-up only counts if the answers stay the same. Two checks:

- The suite writes 14 measurement lines, the numbers the product's docs quote. Sorted, they hash to the same value before and after.
- A new fast test runs the threaded cell and the single-threaded cell on small inputs and checks they agree exactly. We broke it on purpose twice (shifting a seed, swapping two policy labels) and it failed both times.

## The result

The suite's wall time went from 127 s to 66 s on the same four cores. The CPU time was unchanged (229 s, then 233 s), as it should be: the same work, spread over more cores.

The slowest file is now `pairMix`, at 65 s while it shares the cores. The CPU-seconds put the floor near 60 s on four cores, so most of the easy part is done. The next real saving has to come from the pair loop itself, and that will change floating-point results. That needs an argument about tolerance, not a byte comparison.

The details, including what the parity test does not catch: [`docs/history/ci-perf-2026-11-13-qps-cell-workers.md`](../history/ci-perf-2026-11-13-qps-cell-workers.md).

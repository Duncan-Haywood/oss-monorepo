---
title: "When more threads stop helping: a simulation suite that hit its CPU floor"
seo_title: "When worker threads stop speeding up a test suite"
date: 2026-11-13
tags: [performance, testing, quick-pick-survey]
description: "A second worker-thread change took a 102 s simulation suite to 94 s, not half. User time over cores said why: the suite is now CPU-bound."
---

This morning a perf run [halved Quick Pick Survey's simulation suite](2026-11-13-one-slow-test-file-on-four-cores.md) by moving one slow file's six independent runs onto worker threads. Its write-up named the next slowest file, `pairMix`, and predicted that the same trick would buy "a few seconds, not a halving". This run tried it and measured how close that guess was.

`pairMix` compares two ways of choosing which pair of items to show next. It runs each one with three seeds, 1,000 items and 3,000 answers per run. The six runs share nothing, so they went onto worker threads the same way the pool-cap cells did. The run code itself moved into a module unchanged.

## Same answers

The suite writes 14 measurement lines, the numbers the product's docs quote. Sorted, they hash to the same value before and after. A new fast test runs the threaded and the serial version on small inputs and requires them to be exactly equal. Shifting a seed by one in the worker, or swapping the two selectors, both make it fail.

## The numbers

Two runs each, same four-core container:

| | wall | user (CPU) |
|---|---:|---:|
| before | 105 s, 100 s | 347 s, 357 s |
| after | 94 s, 95 s | 355 s, 359 s |

About 8% faster here (on CI, the one run so far took the same 124 s as before, so the saving there is not shown yet). `pairMix` went from 89 s to 57 s, but the suite barely moved, because the other files slowed down to make room for its workers.

The reason is in the second column. The suite needs about 357 CPU-seconds. On four cores that cannot finish in less than about 89 s, and it now takes 94 s. In the morning there were idle cores waiting on one slow file, so spreading the work helped a lot. Now there are none. Which file finishes last says nothing useful any more: whichever file runs last just has the most other work competing with it.

So the guess was right, and the rule is simple enough to write down: **divide user time by the number of cores before reaching for threads.** If the wall time is already close to that number, more parallelism cannot help. The next saving here has to come from doing less work in the pair loop itself, and that will change floating-point results. That needs an argument about tolerance, not a byte comparison.

Details and the ranked next steps: [`docs/history/ci-perf-2026-11-13-qps-pairmix-workers.md`](../history/ci-perf-2026-11-13-qps-pairmix-workers.md).

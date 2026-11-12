---
title: "The slow test was a hidden second build"
seo_title: "Finding a hidden build in a slow Node.js test suite with TAP durations"
date: 2026-11-12
tags: [performance, testing, ci, node]
description: "A per-test timing of our site builder's tests showed one test spending 31 s on a whole build. Moving it into a child process cut the suite from 204 s to 180 s."
---

Every pull request here waits on "Test the site builder", the step that tests
the program that builds [the catalogue site](https://marisstella.app/). It is
the largest step in our CI: 116 runner-minutes in the last 600 runs. Most of
that is one file, `build.test.mjs`. It builds the real site once and then runs
about 300 tests against what came out.

Yesterday's note on this suite guessed that after the build, the time went on
those 300 tests running one by one. We hadn't measured that, so today we did.
Node's test runner prints a `duration_ms` for every test when asked for TAP
output (`node --test --test-reporter=tap`). Sorting those numbers took a dozen
lines of Python.

The guess was wrong. One test took 81 s on a cold cache (31 s warm), more than
the next 20 together. It was the first of two tests that check the `/compare/`
and `/guides/` pages against a small fixture of two fake calculators. The first
of them to run built that fixture as a whole second site, in the same process,
after the main build had finished. It had to wait its turn. The builder keeps
some state at module level, so two builds can't share a process.

The fix is a pattern the file already used for its determinism check: build
the fixture in a child process and start it at the same moment as the main
build. The child prints the one part of the result the tests read, and both
tests make exactly the same assertions as before.

Measured with the same command CI runs, warm cache, before and after in turns:

| | wall | CPU (user) | tests passing |
|---|---:|---:|---|
| before (mean of 2) | 203.6 s | 295.0 s | 1554 |
| after (mean of 2) | 180.2 s | 296.3 s | 1554 |

That is 23 s (11%) off the wall clock for the same work. The fixture build
still runs, just on a core that was sitting idle. It isn't completely free: the
main build slows about 9 s while it shares four cores with two children.

The lesson is the one this track keeps learning: time the tests before you
theorise about them. The full reading and the ranked list of what is left are
in [the history note](../history/pages-test-perf-2026-11-12-hub-fixture-child.md).
The next lever is the main build itself, which is now nearly half of the step.

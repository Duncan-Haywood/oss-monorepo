---
title: "One full build fewer, and the tests finish no sooner"
seo_title: "Removing a duplicate build from a Node test suite: CPU down, wall flat"
date: 2026-11-11
tags: [performance, testing, ci]
description: "Our site tests built the same site three times. Removing one build cut CPU by 13% over three timed pairs. Wall time did not move, and here is why."
---

The tests for the builder behind this site are the heaviest step in the repository's CI. A run takes about five minutes on a 4-core runner. Yesterday's performance note left one idea open: count how many times the suite builds the whole site, and share any builds that are the same.

There were four full builds, and three had the same settings. One test file builds the real site and checks hundreds of things in it. A second file existed for one test. It builds the site twice more, in two separate processes, and checks that both builds get the same offline-cache name. If the name depended on the output folder or on build order, every deploy would throw away visitors' offline copies for nothing.

That test now lives with the main file. It compares the build the main file already makes with one extra build in a child process, started at the same moment. The claim is the same: two independent builds in different folders get the same name. One build fewer.

Three timed pairs, before and after taken in turns, all 1,535 tests passing each time:

- CPU: 588 s before, 509 s after, 13% less.
- Wall time: 289.2 s before, 289.6 s after. No change.

The wall time didn't move because the removed build was never on the critical path. The main test file waits about two minutes for its build and then runs some 300 tests one after another. The two determinism builds were running on the other cores the whole time. Taking them away left those cores idle.

On CI each job gets its own virtual machine, so saving CPU there doesn't shorten the job or free a runner for another pull request. It does help when an agent runs the suite on a machine that is busy with other work. And the suite has one file fewer to keep in step.

The next lever is the long tail in the main file: about 170 seconds of tests run one at a time after the build is ready. Moving that would mean building once to a fixed folder and letting several test files read it in parallel. The full numbers and that plan are in [`docs/history/pages-test-perf-2026-11-11-determinism-one-child.md`](../history/pages-test-perf-2026-11-11-determinism-one-child.md).

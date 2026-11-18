---
title: "The test that ran the same 13-second search twice"
seo_title: "Speeding up a Node test file by sharing one worker-thread run"
date: 2026-11-16
tags: [ventures, shed-designer, performance, testing]
description: "A shed-designer test file took 50 s because two tests ran the same deterministic worker search. Sharing one run cut it to 37 s, no check removed."
---

The [shed designer](https://marisstella.app/shed-designer/) opens on a gallery
of ready-made sheds. Picking them takes a search over thousands of designs, so
the search runs in three worker threads, one per kind of shed. Its test file,
`gallery.test.mjs`, was the second-slowest of the venture's 58 test files:
50.4 seconds on a 4-core machine.

Timing each test showed why. One test ran the worker search and checked the
gallery it produced (13 s). A later test ran the worker search *again*, then the
same search serially on the main thread, and checked that the two agreed
(37 s). The second worker run could not find anything the first had missed:
the search is deterministic, and building the gallery only reads its result.
We checked both facts before changing anything: the 11-million-character JSON
of the result was identical after the gallery was built from it, and identical
between two separate runs.

So the file now runs the worker search once and both tests await the same
promise. The comparison against a fresh serial run is unchanged, and so is
every assertion. The file takes 36.7 to 37.1 seconds, about 13.5 seconds less,
and three cores stop spending 13 seconds each on a repeat.

It is a small fix. The lesson we keep relearning is that the slow part of a
test suite is rarely slow code. More often the same expensive work is done
twice by two tests that each look reasonable on their own. The full reading is
in [the perf note](../history/ci-perf-2026-11-16-shed-gallery-parallel-once.md).

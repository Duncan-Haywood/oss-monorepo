---
title: "Splitting our slowest test file did nothing; remembering the last roster did"
seo_title: "Why splitting a slow node --test file did not speed the suite"
date: 2026-11-13
tags: [shift-roster-builder, testing, performance, process]
description: "A 101 s test file looked like the long pole of a 149 s suite. Splitting it changed nothing: the suite was CPU-bound. Remembering repeat builds cut it to 132 s."
---

A red-team run this afternoon spent about 25 minutes seeding ten faults into the
[Shift Roster Builder](../../ventures/shift-roster-builder/). Each fault needs a
full run of the venture's test suite, and that suite took about 150 seconds. Its
run record blamed `calc.test.mjs`, which takes 101 seconds on its own. Our first
fix was to split that file up. It made no difference.

## The split that did nothing

`node --test` runs test files in parallel, so a 101-second file in a 149-second
suite looks like the long pole. We moved the ten slowest tests (exact-search
proofs, bounds, the open-hours repair, about 74 seconds between them) into three
new files and ran the suite again.

| Suite run (4-core cloud container) | Wall | CPU (user) |
|---|---|---|
| Before | 148.8 s | 421 s |
| `calc.test.mjs` split four ways | 150.3 s | 427 s |

The reason is in the CPU column. Node's test runner uses one fewer worker than
the machine has cores, so three here. At 421 CPU-seconds the floor is about
140 seconds, however the files are cut. The suite was already within 6% of that
floor. The long file was never the problem; the total work was. We reverted the
split.

## Where the CPU went

We timed every call to `buildRoster`, the function that builds and tries to
prove a week's roster, in a full suite run (temporary instrumentation, not
committed):

- 1,081 calls, 387 of the suite's ~421 CPU-seconds.
- 114 seconds were calls whose inputs (staff, shifts and options) had already
  been built once. 92 seconds of those repeats came in the same test file, so
  the same process.
- The 7-person sample week with default options was built 42 times across 11
  files, about a second each.

## The change

`buildRoster` now remembers its last 32 builds in the process. A repeat of the
same input returns a copy of the stored roster. A caller that edits the copy
doesn't touch the stored one, and a test checks that. The key is the
JSON of the staff, shifts and options. An input that JSON would misread (a Set,
a Map, a function, a Date, NaN written as null) is built fresh rather than risk
a false match, and `memo: false` always builds fresh. The test that checks the
same input gives the same roster now builds twice with `memo: false`, so the
memo can't pass it on the solver's behalf.

On the page this means building an unchanged week a second time comes back at
once instead of re-running a multi-second proof.

| Suite run | Wall | CPU (user) | Tests |
|---|---|---|---|
| Before | 148.8 s | 421 s | 504 pass |
| Memo of 8, oldest dropped | 134.5 s | 375 s | 505 pass |
| Memo of 32, least recently used dropped | 131.7 s | 367 s | 505 pass |

The first memo kept only 8 builds. Counting hits showed `calc.test.mjs` hitting
3 times in 212 builds: the sample week dropped out between its uses. Refreshing
an entry on each hit and keeping 32 bought another 3 seconds.

## What we took from it

Before splitting a slow test file, divide the suite's CPU time by the number of
test workers and compare that with its wall time. If they are close, the suite is
CPU-bound and only less work helps. Here about a quarter of that work was
building a roster the process had already built.

The red-team tool still runs the whole venture suite for each fault, not just
the tests that import the file under test. That would be the bigger saving. The
tool sits in an owner-reviewed path, so this run left it alone.

The saving is 17 seconds of wall time and 54 CPU-seconds a run, about 12%.
That's smaller than the 92 seconds of in-process repeats suggested. Most of
`steady.test.mjs`'s 290 builds turned out to be distinct inputs (278 misses).

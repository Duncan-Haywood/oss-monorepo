---
title: "Our test suite drew the same 2,563 pictures five times"
date: 2026-10-24
description: "A site's test file took 460 seconds, mostly redrawing identical share-card PNGs in each of five builds. An in-process cache cut it to 325, output unchanged."
topic: infrastructure
tags: [performance, testing, nodejs, static-site, ai-agents]
---

# Our test suite drew the same 2,563 pictures five times

The site this repository publishes has about 4,300 pages, and most of them get
their own share card: the 1200x630 picture a chat app shows when someone pastes
a link.
They are drawn by our own code, a small rasteriser with bundled fonts, and
compressed to PNG. A full build draws 2,563 of them.

The test job for that build was the slowest check most pull requests waited
on. Node's test runner runs test files in parallel but the tests inside one
file in order, so the slowest file sets the pace. That file,
`build.test.mjs`, took **460 seconds**.

## Five builds, one set of pictures

Five tests in that file build the site: a shared build most tests read, a
second build to check two builds give the same cache name, a build with the
offline worker switched off, and two small fixture builds of only two tools.

The two-tool builds were the clue. They still took 31 seconds, so most of a
build's cost had nothing to do with the tools. Timestamps around each phase
of one fixture build:

| Phase | starts at |
|---|---|
| wrap pages in site chrome | 5.9s |
| mark sponsor links | 5.9s |
| **draw share cards** | 6.7s |
| add offline support | 34.1s |

27 of 37 seconds went into drawing cards for the ~1,200 research and writing
pages that every build includes. A CPU profile was 71% idle on the main
thread, because the drawing happens on worker threads. One card takes about
63 ms. Each of the five builds drew the same cards again.

## The fix

A card depends only on its options (headline, kicker, colours, address) and
on the drawing code. The drawing code cannot change while a process runs.
So the card renderer now keeps each PNG it has drawn, keyed by its options,
and writes a repeat from memory.

| | before | after |
|---|---|---|
| `build.test.mjs` | 460s | **325s** |
| tests passing | 303 of 304* | 304 of 304 |
| one production build, `diff -r` of 15,367 files | | identical |

*The one failure before was our own doing: the build reads git history, and
we had made a commit while the tests ran. That is worth knowing if you run
this suite while committing.

A single production build never draws the same card twice, so the deploy
does exactly what it did before. Two new tests pin what the cache relies on:
a card is the same bytes every time it is drawn, and a card from the cache
is byte for byte a fresh draw.

## The pattern

When the same expensive, deterministic work runs several times in one
process, it is a cache, not a rewrite. The hard part was seeing it. Summed
CPU time pointed nowhere because the main thread was idle. Timestamps around
each phase showed where it was waiting.

*An AI coding agent (a Claude session) did this work and wrote this post,
working in this repository at the owner's request. Times are from one 4-core
cloud container; CI runners will differ by a constant factor.*

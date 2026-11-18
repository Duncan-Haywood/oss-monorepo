---
title: "The idle time was a missing cache: timing every phase of our site build"
seo_title: "Profiling a Node.js site build: event loop utilization per phase"
date: 2026-11-12
tags: [performance, engineering]
description: "A profile said our site build was idle 57% of the time. Timing each phase traced that to a missing cache; then three small changes cut 4 to 5 s."
---

The build that publishes this site (`platform/pages/build.mjs`) turns about
170 tools, their guides, the research index and the blog into some 4,500
pages. Every deploy runs it, and so does every test run of the site builder.
An earlier CPU profile found the main thread idle for 57% of the build, and
its write-up asked the obvious next question: what is it waiting for?

## Timing each phase

A CPU profile only shows "(idle)". It can't tell you which `await` the idle
belongs to. So we timed the phases instead. A small wrapper passes the build a
logger that prints the elapsed time, plus Node's
`performance.eventLoopUtilization()` since the last line. That second number
is the share of the time the main thread was actually busy. A throwaway copy
of the build then called the logger before every step.

The first two runs were 116 s and 89 s, and the main thread was busy only 36%
and 43% of the time. Almost all the idle sat in two places: drawing share
cards (the preview pictures social sites show) took 44 s at 18% busy, and a
second card pass took 12 s at 3% busy. In both, the main thread was waiting
on a pool of worker threads that drew the pictures.

That is what a build does when it has no card cache. CI points
`PAGES_CARD_CACHE` at a cached directory, so a deploy reuses the cards it
drew last time. The earlier profile had been taken without it. With the cache
warm, the same build took **38.9 s, busy 93% of the time**. The idle we went
looking for came from how the build was being measured, not from the build.

## What was left

A warm build is CPU-bound, so the question becomes where the CPU goes. A
`node --cpu-prof` named three costs that small changes remove:

- **Gzip sizes, 2 s.** The offline page tells visitors how much a category
  costs to download, so the build gzips every file in every bundle at level 9.
  It did this one file at a time on the main thread. Now it uses async `zlib`
  on Node's thread pool, eight files at a time. The numbers come out the same.
- **A Python step, 1.9 s.** The research index is built by a Python script,
  and the build blocked on it. Now it starts at the beginning and is awaited
  only where its output is first read. It runs on another core while the
  JavaScript passes do their work.
- **One regex, 0.9 s.** The pattern that strips inline `data:` favicons starts
  with `\s*`, so the engine tries a match from every run of whitespace in every
  page, and almost no page has a `data:` URI. A cheap check for `data:` now
  runs first.

## Same site, faster

Before and after builds are byte-identical apart from `version.json`, which
records the build time. The offline cache name is the same in both, and it
hashes every file. Across three alternating before/after pairs the build was
5.0 to 8.5 s faster. Our best estimate is 4 to 5 s off a build of 39 to 46 s,
about a tenth. Every deploy and every Pages test run saves that.

What's left of the cost isn't waiting at all. Five passes each read and
rewrite all 4,500 pages, and writing those files is now the largest single
cost in the profile. The full reading is in
[the history note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-12-warm-phases.md).

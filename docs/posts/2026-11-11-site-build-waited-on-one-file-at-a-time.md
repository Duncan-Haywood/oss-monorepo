---
title: "Our site build spent most of its first 15 seconds waiting on one file at a time"
seo_title: "Speed up a Node.js static site build: copy files concurrently"
date: 2026-11-11
tags: [performance, nodejs, static-site, build, open-source]
description: "Copying 1,331 tool folders one file at a time kept our Node.js site build idle. Sixteen at a time cut 4 s per build, with the same output."
---

The catalogue at marisstella.app is one static site built from 1,331 small
tools. Every build starts by copying each tool's folder into the output. The
copy was a plain loop: for each tool, for each file, read it, rewrite the
site address, write it, and wait for that to finish before starting the next.

A CPU profile of a cold build showed the main thread idle for 77.8 of its
136.6 seconds. Some of that idle time was worker threads drawing share images,
which a warm cache skips. But the first 13 seconds were the copy, and the
copy used 0.8 seconds of CPU in that time. The rest was waiting on the disk,
one request at a time. Node can have four file operations in flight at once
(libuv's default thread pool), and the loop only ever asked for one.

The fix was one line. The build already had a helper, `mapLimit`, that runs
a function over a list with at most N calls in flight and keeps the results
in input order. The copy now runs through it, 16 tools at a time. It is safe
because each tool writes only into its own folder, and the copy step reads
nothing that another tool writes.

Measured on 4 cores:

- **The copy alone**, cold disk cache: 6.1 s down to 2.4 s. Warm: 4.4 s down
  to 2.2 s. Allowing 32 or 64 at a time was no faster than 16.
- **A whole build**, three before-and-after pairs: 75.9 s down to 71.6 s on
  average, 4.3 s (5.7%) saved per build. The CI run for every pull request
  does three full builds in its tests and one to deploy.
- **The output** matched file for file. The only difference was the build
  timestamp in `version.json`.

The next step in the build looks similar but stays one at a time on purpose.
It decides whether a link points inside the site by checking whether the
target file exists, and that same step writes files that other tools'
pages might link to. Run in parallel, a link could pass or fail depending on
which tool finished first. A build should give the same answer every time,
even if that costs a few seconds.

The profile, the timings and the ranked list of what to try next are in
[the engineering note](../history/pages-build-perf-2026-11-11-parallel-copy.md).
The code is MIT licensed in
[`platform/pages/build.mjs`](../../platform/pages/build.mjs).

---
title: "Two more one-file-at-a-time passes in a static site build, and why they only saved 1.5 seconds"
seo_title: "Node.js build: concurrent file reads in HTML passes, a modest win"
date: 2026-11-11
tags: [performance, nodejs, static-site, build, open-source]
description: "Two HTML passes read 8,496 pages one at a time. Reading 32 at a time cut them from 6.3 s to 4.8 s with byte-identical output, less than hoped."
---

Earlier today the catalogue's site build lost about 10 seconds when two
passes that each read every page one at a time [became one concurrent
pass](2026-11-11-two-passes-one-read.md). The same pattern was in two more
places near the end of the build:

- the check that no blog post reuses another page's title, which loaded all
  8,496 HTML pages into memory, one `readFile` after another;
- the step that adds `<link rel="modulepreload">` tags so a tool page fetches
  its whole JavaScript module tree at once, which also read every page in
  turn to find the 231 that need the tags.

Both now read 32 files at a time with the build's existing `mapLimit`
helper. Measured on 4 cores, old and new taking turns:

- **Title check**: 2.55 s to 2.02 s (−21%).
- **Preload step**: 3.71 s to 2.74 s (−26%).
- **Output**: a full build with the change is byte-identical to one without
  it, apart from the timestamp file.

That is about 1.5 seconds off a two-minute build, much less than the earlier
change. The reason is useful: on this machine the files were already in
memory, so most of each pass was CPU work (decoding 1.1 GB of HTML and
running a regular expression over it), and concurrency only helps with
waiting. The earlier passes also wrote every page back, which is where more
of their waiting was.

The order of the results had to stay the same. The title check returns a Map,
and its order decides which post is renamed when two clash, so the reads now
run concurrently but the Map is still filled in directory order. A new test
fails if the Map is filled in finishing order instead. We checked that.

The bigger saving next is to skip work, not run it in parallel: the preload
step reads about 8,000 pages that have no module script at all. The timings
and that list are in [the engineering note](../history/pages-build-perf-2026-11-11-identity-preload-reads.md).
The code is MIT licensed in
[`platform/pages/preload.mjs`](../../platform/pages/preload.mjs) and
[`platform/pages/page-identity.mjs`](../../platform/pages/page-identity.mjs).

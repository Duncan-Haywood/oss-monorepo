---
title: "Our blog build waited on every post it wrote"
seo_title: "Node.js: awaited fs.writeFile per file vs writeFileSync, measured"
date: 2026-11-15
tags: [engineering, performance, nodejs, ci]
description: "Writing 4,741 blog posts with an awaited mkdir and writeFile each left the build idle 45% of the time. Synchronous writes cut 2 s from every build."
---

This site is built by one Node script. Among other things it turns every
post in `docs/posts/` into a page: 4,741 of them this morning. Every merge
runs that build before deploying, and every agent session that touches the
site waits on it locally.

A CPU profile of one build looked flat: no single function stood out. So we
cut the profile into one-second slices and asked what the main thread was
doing in each. During the few seconds the blog was being written, it was
idle about 45% of the time.

The loop looked like this, for every post:

```js
await fs.mkdir(postDir, { recursive: true });
await fs.writeFile(path.join(postDir, 'index.html'), html);
```

Each `await` sends the work to Node's thread pool and waits for the answer
before going on. Writing a small file takes microseconds. The round trip is
the cost, and the loop made about 9,500 of them, one after another, with
nothing else to do in between.

## What we changed

The loop now calls `mkdirSync` and `writeFileSync`. "Sync" sounds wrong in
Node, but it only hurts when something else in the process could have run in
the meantime. Here nothing could: the one other job running at that point is
a separate Python process, which does not need this one's event loop.

## What it saved

| | before | after |
|---|---|---|
| writing the blog | 7.2 to 7.6 s | 5.2 to 5.6 s |
| a full site build | 50.7, 53.0 s | 47.7, 49.4 s |

The output is the same: a full build before and after, compared file by
file over 29,376 files, differs only in the timestamp the build stamps on
itself.

One thing it did not do: speed up the site builder's own test suite, which
builds the site four times. Two runs of the suite on each side overlap
(137.8 and 137.6 s before, 138.9 and 133.1 s after). Those builds share four
cores with 140 other test files, and 2 seconds of a build disappear in that
noise. We had expected otherwise, and the measurement said no.

It is the third time this month we found this exact shape here (our page
rewriter and our publish check had it too). A slow step with a flat profile
and a lot of idle time is usually a loop that awaits one small thing at a
time. The full reading is in
`docs/history/pages-build-perf-2026-11-15-writing-sync-writes.md`.

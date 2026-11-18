---
title: "The third pass with the same slow read: three more seconds off the site build"
seo_title: "Node fs.promises vs readFileSync on 8,800 small files: 3 s off a build"
date: 2026-11-12
tags: [performance, nodejs, static-site, build, open-source]
description: "Three more passes in the site build read every page through fs.promises. Sync reads cut each pass by about half and the build by 3.1 s, same bytes out."
---

This morning two runs found that reading thousands of small files through
Node's `fs.promises`, 32 at a time, is slower than plain `readFileSync` one
after another: the per-call overhead of the promise API outweighs the file
itself. They fixed the cache-name hash and the sponsor and notice pass.

The site build had three more passes doing the same thing over all 8,831
pages: the check that renames a blog post whose title clashes with a tool's,
the pass that completes share tags and plans share cards, and the pass that
adds module preload links to tool pages.

Measured one at a time on a finished build, three runs each:

| pass | before | after |
|---|---:|---:|
| title clashes | about 1.5 s | about 0.65 s |
| share tags | about 4.6 s | about 3.5 s |
| module preloads | about 1.9 s | about 1.0 s |

The whole build, alternating old and new code: 91.5 s and 91.6 s before,
88.6 s and 88.3 s after. Every file in the output is byte-identical apart
from the build timestamp.

Three seconds is small, but the build runs on every merge, every three hours,
and inside the site's own test suite, and this was a 50-line change. The
share-tag pass is still 3.5 s with nothing to draw; that time is now regex
work, which is the next thing to profile.

Details: [the history note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-12-share-identity-preload-sync.md).

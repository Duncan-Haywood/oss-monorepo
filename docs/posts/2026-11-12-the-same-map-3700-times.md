---
title: "We built the same map 3,700 times: ten percent off a static site build"
seo_title: "Profiling a static site build: per-page work that should run once"
date: 2026-11-12
description: "A CPU profile of our site build found 12 s of blog-renderer work redone for every post page. Three memos cut the build 10%, output byte-identical."
topic: infrastructure
tags: [performance, profiling, nodejs, static-site]
---

Our site build writes about 26,000 files, including roughly 3,700 blog post
pages, and takes a little under two minutes on four cores. Earlier passes cut
it by changing settings and reading files differently. This time we
profiled it with `node --cpu-prof` and added up self time per function.

Half the profile was idle: the build waiting on child processes and the
disk. Of the busy half, the biggest piece of our own code was the blog
renderer, about 12.6 seconds in four functions. All four were doing work that
did not depend on the page being rendered:

- **Links between posts.** A post that links to another post's source file
  gets that link rewritten to the post's page. The lookup table from source
  path to page was rebuilt for every page: 3,700 entries, 3,700 times,
  with two HTML-escape calls each. About 27 million escapes, 8 seconds.
- **Related posts.** "Nearest in date" breaks ties, and the sort comparator
  parsed both dates on every comparison. Each post's day number is now
  computed once, beside the tag and word index that was already shared.
- **Dates in words.** `toLocaleDateString` builds a formatter every call.
  There are a few hundred distinct dates on the blog and tens of thousands of
  places that print one, so the answer is now remembered per date.

The fix was three small memos. We then rebuilt the whole site with and
without them and compared all 26,332 files: only the build timestamp
differs. Alternating old and new builds on the same machine, the mean went
from 112 to 101 seconds, 10% off every deploy and every test run that builds
the site.

The useful habit: when a function is cheap, it can still be the most
expensive thing in the build if it runs once per page and does work for
the whole site each time. A profile finds those quickly. A rewrite in a
faster language would not have.

The measurements and what is left to try are in
[the history note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-12-writing-per-page-memos.md).

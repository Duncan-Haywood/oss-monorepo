---
title: "The site's tests read every page twenty times"
date: 2026-11-12
tags: [performance, testing, engineering]
description: "Twenty tests each re-read all 4,471 built pages. Reading each page once cut the tests after the build from 126 s to 58 s, with every test unchanged."
---

# The site's tests read every page twenty times

The test file for the build that publishes this site builds the whole site
once, then runs 311 checks against it. About twenty of those checks walk the
entire output: every page has a canonical link, every page points at the
offline worker, every injected link resolves. Each one listed all 25,000
files again and read all 4,471 pages, 97 MB of HTML, from disk again. Each
took about three seconds, doing the same work as the one before it.

Nothing in the file writes to that shared build once it exists; the checks
that need a writable folder make their own. So the listing and each page's
text can be read once and handed to every check that asks. Paths outside the
shared build are still read fresh every time.

Measured on the same machine, one run straight after the other:

| | before | after |
|---|---:|---:|
| the whole file | 383 s | 314 s |
| the 310 checks after the build | 126 s | 58 s |
| peak memory | 1,682 MB | 1,661 MB |

All 311 checks pass in both runs, and none of them changed. Holding the
pages in memory did not raise the peak, because the build itself is the
peak. What is left is mostly that build: about 253 of the 314 seconds.
Full notes:
[`docs/history/pages-test-perf-2026-11-12-shared-walk-memo.md`](../history/pages-test-perf-2026-11-12-shared-walk-memo.md).

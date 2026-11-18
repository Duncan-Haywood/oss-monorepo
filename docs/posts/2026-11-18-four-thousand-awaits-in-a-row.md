---
title: "Four thousand awaits in a row: a check that spent two-thirds of its time idle"
seo_title: "Why sequential async file reads in Node can be slower than sync ones"
date: 2026-11-18
tags: [perf, platform]
description: "A check read 2,565 pages with one awaited fs call after another and sat idle two-thirds of the time. Sync reads: same output, 610 ms down to 150 ms."
---

Before someone writes a new "this calculator vs. a spreadsheet" page, a small
script, `platform/pages/surface-budget.mjs`, lists what that product already
publishes and the angle each page takes. It reads the files rather than open
pull requests, because three sessions once wrote the same kind of page for
one calculator on the same afternoon, each after a clean check.

The catalogue has grown to 1,399 product pages and 2,565 marketing pages, and
one pass over them took about 610 ms. A CPU profile showed 395 ms of that as
idle: the process was not computing anything, it was waiting. Each directory
listing and each file read was an `await` on Node's asynchronous file API,
one after another. Every one of those calls hands the work to a background
thread and wakes the main thread when it is done. With nothing running in
parallel, that round trip, about 4,000 times over, is pure overhead.

Reading the same files with the synchronous calls does the same work without
the hand-offs: 150 ms per pass. The output of all three modes of the script is
byte-for-byte the same as before.

The test file had a second cost on top: five tests each scanned the whole
tree again, though none of them changes it. They now share one scan. Together
the test file went from 7.3 s to 1.6 s locally (it was 19.5 s on the shared
CI runners), and the `--check` the CI runs went from 0.75 s to 0.28 s.

Async I/O pays when there is something to overlap: other requests, other
reads in flight. A one-shot script reading small files in order has nothing
to overlap, and there the plain synchronous call is the faster and simpler
choice. The full reading and the next candidates are in
`docs/history/pages-test-perf-2026-11-18-surface-budget-sync-scan.md`.

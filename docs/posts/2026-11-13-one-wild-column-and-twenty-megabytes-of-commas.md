---
title: "One wild column and twenty megabytes of commas"
seo_title: "Why a damaged .xls took 1.5 s to read, and a one-line fix"
date: 2026-11-13
tags: [ai-bookkeeper, perf, xls, testing]
description: "A fuzz test of ai-bookkeeper's .xls reader took 19 s. A damaged cell could claim column 65535. Padding rows in one step cut it to 1.3 s, same output."
---

[ai-bookkeeper](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/ai-bookkeeper)
reads old Excel bank exports (`.xls`) in the browser with no library. One of
its tests feeds the reader 300 deliberately damaged copies of two sample
statements. It checks that each one is either read or refused with a clear
error, and never crashes.

That one test took 19 seconds, more than the next twenty test files in the
suite put together. Most damaged files took about a millisecond. Thirteen took
between 0.8 and 1.8 seconds each, and every one of those came back as a CSV of
10 to 20 megabytes.

The damage that did it was four `0xff` bytes landing on a cell's column number.
That cell now claimed to sit in column 65,535. The reader pads every row to the
widest row so the CSV stays rectangular, and it did that one empty cell at a
time: 65,536 cells for each of a few hundred rows.

The fix keeps the output byte for byte: write the cells a row really has, then
add the missing empty cells as one run of commas
(`",".repeat(width - row.length)`). The 300 files give the same hash before and
after. The test now runs in 1.3 s instead of 19, and the whole suite in 27.6 s
instead of 45.2. We also added a check to the test that every row of a read CSV
has the same number of fields. That pins the padding so a later speed-up can't
quietly drop it.

The first version of that check split the CSV with a regular expression that
looks ahead for balanced quotes. On a 20 MB string that is quadratic, and the
"faster" test took 52 seconds. A plain loop over the characters fixed it.

The fix leaves one thing open. A damaged file still produces 20 MB of commas,
just quickly now. Refusing a cell that sits thousands of columns past every
other cell would be better for the person importing it. That changes what the
reader returns, so it's a product change, not a speed one. It's first on the
list in the
[perf notes](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-13-xls-row-padding.md).

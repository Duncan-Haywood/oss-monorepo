---
title: "Two thirds of a loop was skipping: the ad budget optimiser's test drops from 21 s to 6 s"
seo_title: "A budget dynamic programme 3.4x faster: loop over reachable totals"
date: 2026-11-14
tags: [ad-spend-saturation-optimizer, performance, algorithms, dynamic-programming]
description: "The ad spend optimiser's exact budget split mostly checked totals no channels could reach. Bounding the loop made a test 3.4x faster, same answers."
---

The [ad spend saturation optimiser](https://marisstella.app/ad-spend-saturation-optimizer/)
fits a diminishing-returns curve to each ad channel and then finds the best
split of a weekly budget. The split is exact: a dynamic programme over a grid
of spend units, which handles S-shaped curves where the even split is the
wrong answer.

The programme adds one channel at a time. For every possible total `b` it tries
every amount `u` the new channel could take and keeps the best
"previous channels at `b - u`, plus this channel at `u`". Many of those
`b - u` totals cannot be reached by the channels added so far, and the old
loop found that out one by one: look up the table, see minus infinity, skip.

For the first channel only a total of zero is reachable before it, so almost
every check was a skip. The fix tracks the lowest and highest total the
channels so far can reach and loops only between them. Same order, same
tie-breaking, so the same split to the last bit.

One test in the suite builds a deliberately oversized grid (80,000 totals).
It went from **21.0 s to about 6 s**, and the venture's whole suite from
**29.3 s to 13.7 s** when run alone. The answers were checked three ways: a
hash of every total on the frontier for four sets of curves, the command-line
tool's output on the sample data, and a new test that runs the old loop next
to the new one at every total.

On real inputs the grid is a few thousand totals and the page was already
quick; this mostly buys back time for every session and CI job that runs the
repository's tests. Details, and what is still slow:
[`docs/history/ci-perf-2026-11-14-ad-spend-frontier-reachable-range.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-14-ad-spend-frontier-reachable-range.md).

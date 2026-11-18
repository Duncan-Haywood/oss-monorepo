---
title: "After a dozen CI speed-ups, a quarter of our runner time is just git checkout"
seo_title: "A quarter of CI time is git checkout"
date: 2026-11-09
description: "A profile of 199 CI jobs: 26% of runner minutes are checkout, and the small guard workflows spend 73% of their time cloning. What is left to fix."
topic: infrastructure
tags: [performance, ci, github-actions, profiling]
---

# After a dozen CI speed-ups, a quarter of our runner time is just git checkout

We profiled 199 CI jobs across 20 workflows in a 35-minute window on
2026-11-09. They used 170.9 runner-minutes. Of those, 44.5 minutes (26%) were
`actions/checkout`, and 5.3 more were setup and teardown.

The shape matters more than the total. The big jobs (the site build and its
tests) spend 14 to 16% of their time on checkout, because they do real work.
The small guard jobs (conflict markers, einvoice-preflight, research) spend 73
to 75% of theirs cloning a large monorepo to run a check that reads a few
files. Their median run is about 30 seconds, and about 22 of those are the
clone.

Earlier passes took the algorithmic costs: a zlib level, a duplicated gallery
search, a glob that scanned every file. Each was a setting or a library
choice, never a slow language. What remains is a clone that is bigger than the
job needs. A sparse checkout of the paths a guard reads would cut most of it.

The catch is not technical. Those workflow files are on the repository's
control-plane list, so changing them waits on the owner. That is a reasonable
trade for protection against rogue agents, and the profile now puts a number
on its price: roughly 25 runner-minutes in every 35 minutes of pool time.

Reading and the ranked list of what was not changed:
`docs/history/ci-perf-2026-11-09-pool-reading-checkout-bound.md`.

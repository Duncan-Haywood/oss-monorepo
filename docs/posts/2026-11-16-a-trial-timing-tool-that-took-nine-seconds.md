---
title: "A trial timing tool that took nine seconds on a big export"
date: 2026-11-16
tags: [ventures, trial-conversion-timing-analyzer, performance]
description: "The trial timing analyzer took 9 s on 200,000 trials and crashed past 125,000 conversions. Binning each trial once made it 10x faster, same results."
---

The [trial conversion timing analyzer](https://marisstella.app/trial-conversion-timing-analyzer/)
answers a question SaaS teams ask before they cut a 14-day trial to 7: how many
of our paying customers converted after day 7, and how sure can we be? To give
an honest range, it resamples your trials 300 times (a bootstrap) and asks the
same question of each resample.

On an export of 200,000 trials, that took **9 seconds**, and the tab froze
the whole time. With more than about 125,000 conversions it did not finish
at all. It threw a stack overflow.

## Where the time went

Each of the 300 resamples built a new 200,000-row array. It then filtered that
array down to the people who paid, and filtered it again once for every
shorter trial length it was testing. That came to millions of short-lived
arrays, each made just to count something.

The count only needs one number per trial: the day it converted. And because
every trial length the tool tests is shorter than the trial you offer,
everything past your trial length can go in one bucket. So the tool now gives
each trial a bucket once. Each resample adds into a 15-slot histogram, and a
running total from the top answers all 13 questions in one pass.

The random draws are the same draws in the same order, so the ranges are the
same. We checked this rather than assumed it. We ran 300 random datasets,
including fractional days and late converters, through both versions, and
the outputs were byte-identical.

**9.1 s → 0.9 s** for the 200,000-trial case. The test suite went from 9.4 s
to 1.3 s.

## The crash

The per-day chart found its last day with `Math.max(L, ...conversions)`.
Spreading a huge array into a function call overflows the JavaScript stack,
and that happened at about 125,000 values. Two days ago a red-team run fixed
the same pattern in another line of the same function. This was the second
copy. It is now a plain loop, and a new test with 175,000 conversions keeps it
fixed.

The method and numbers are in
[`docs/history/ci-perf-2026-11-16-trial-conversion-bootstrap-histogram.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-16-trial-conversion-bootstrap-histogram.md).

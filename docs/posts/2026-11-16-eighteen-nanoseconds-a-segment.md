---
title: "Eighteen nanoseconds a segment: where a changepoint test spends 14 seconds"
seo_title: "Profiling PELT on Poisson counts: 135 million segment costs"
date: 2026-11-16
tags: [performance, changepoint-detection, pelt, javascript]
description: "One changepoint test scores 135 million Poisson segments. Inlining the cost cut it from 16.1 s to 14.0 s with identical answers; the rest is the algorithm."
---

The [changepoint detector](/changepoint-detector/) finds where a series changes:
a level shift, a new growth rate, a burst of counts. One test in its suite took
16 seconds, almost half of its file. It checks that the detector finds two
changes in the growth rate of 240 daily counts, and that it does not invent one
on a straight exponential trend. It runs 40 seeded series, three analyses
each.

We profiled it before changing anything. The profile said that two thirds of
the time went to one line of arithmetic: the cost of treating counts
`x[s..t)` as one Poisson segment, `2 (a - a log(a / m))`, where `a` is the
segment's total and `m` its length. That line runs inside PELT, the dynamic
program that picks the best set of segments.

Counting the calls instead of sampling them gave the scale. The test made
11,699 PELT runs, about 390 for each analysis, because the trend search fits a
curve at every candidate knot and every fit takes up to 12 rounds. Those runs
scored 135 million segments, at about 18 nanoseconds each.

At 18 ns there is not much left to take from one evaluation, but two things
were waste:

- the cost was a closure call, where PELT already writes the Gaussian cost out
  in its loop. Writing the Poisson cost out the same way, with the same sums in
  the same order, removes the call;
- every PELT run estimated the noise level with two medians, and no count
  model ever reads it.

With both fixed the test takes 14.0 s instead of 16.1 s, and its file takes
34 s instead of 36.6 s. We compared the new PELT with the old one on 10,800
random count series, models and settings, and every result came back identical,
cost included.

The larger win would cut the 135 million, not the 18 ns. Fewer Newton rounds or
a warm start would get there, but both change where the fit ends, so they count
as product changes to measure, not speed-ups. The full reading is in
`docs/history/ci-perf-2026-11-16-changepoint-poisson-inline.md`.

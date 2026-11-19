---
title: "The bowling schedule was looking up the same numbers 144 times a week"
seo_title: "Bowling lane schedule builds 2 to 3 times faster"
date: 2026-11-19
tags: [league-schedule-generator, performance, bowling]
description: "A small closure inside the bowling lane polish took 57% of the time. Inlined, a 24-team season builds in 1.5 s instead of 4.4 s, with the same lanes."
---

The league schedule generator's bowling page deals each week's matches onto
lane pairs so that every team bowls on every pair about equally and rarely on
the same pair two weeks running. For seasons its search can't balance, a
table of answers found by a SAT solver is stored with the page, but even a
stored answer is polished again: every week is re-solved as an assignment
problem, over and over, until nothing improves.

The slowest test file in the repository's slowest venture suite turned out
to be the one that checks those stored seasons: 54 seconds for 36 seasons.
A CPU profile put 57% of it in one tiny function, the price of putting one
team on one pair. For a 24-team league that function ran 144 times per
week re-solve, each time fetching the same six rows of counts and limits and
calling a helper twice to ask whether a count would leave its target range.

The fix was to build each week's cost table in a plain loop, fetch each
team's rows once, and write "does one more game here leave the range" as a
comparison. The numbers going into the assignment step are the same
integers, so the lanes that come out are the same: a hash of 105 results,
stored seasons and searched ones, with and without avoided pairs, matched
before and after.

What changed is the wait. The test file went from 125 s to 71 s. In the
browser, a 24-team, 34-week season now builds in 1.5 s instead of 4.4 s, and
a 20-team one in under half a second. The write-up with the profile and the
leads left over is in
`docs/history/ci-perf-2026-11-19-bowling-polish-price.md`.

---
title: "Stale feed or slow series? A likelihood test that catches every stale feed and still fails"
seo_title: "Detecting stale data feeds vs rounding: a failed likelihood test"
date: 2026-11-15
tags: [changepoint-detection, data-quality, statistics, pre-registration, negative-result]
description: "Pre-registered: a rounded-walk likelihood caught 98-100% of one-tick stale feeds, but called honest rounded series stale 7-12% of the time. Here is why."
---

A series that repeats its last value can mean two things. Either nobody refreshed it (a stale feed, a figure carried forward), or it moved less than the precision it is recorded to, so it rounds to the same number. The [changepoint detector](https://marisstella.app/changepoint-detector/) dates when a series starts repeating more often, and it tries to say which of the two it is. When the moves are large it can tell. When the real moves are about one tick it cannot: both look like a slow series that sometimes sits still.

Two earlier rounds used the size of the move that ends a run of repeats. A stale figure catches up on everything it skipped, so that move grows with the run. Those rounds bracketed a trade-off and both failed a bar. A stretch of 300 steps has too few catch-ups to go on.

**This round used every step.** Model one: a hidden random walk, recorded rounded. Model two: the same walk, but each step has some chance of just repeating the last recorded value. A forward filter over the hidden value gives each model's exact likelihood, and the test is the gap between them. The threshold, 5.41, comes from theory (the 1% point for a parameter on a boundary). Nothing was tuned on the test data.

On 200 fresh simulated series per cell, with the rule written down and committed first:

| series | called stale | bar |
|---|---|---|
| one-tick stale feeds (three kinds) | 98 to 100% | at least 80% |
| rounded slow walks (three kinds) | 7.0%, 11.5%, 9.0% | at most 5% |

It catches every stale feed. It also calls honest rounded series stale twice as often as allowed, so it does not ship.

**Why.** A follow-up on new seeds, after the verdict, shows the test behaving as designed on the true slow half of each series: 1 in 80. The trouble is upstream. The step that dates the change in repeat rate puts its cut a few steps late. That leaves a few fast moves at the end of the "slow" stretch, and the stale-feed model explains them as catch-ups. Trimming the stretch fixes that.

A second check shows why trimming would not be enough. A slow series whose steps are heavy-tailed (mostly tiny, now and then large) was called stale 62% of the time on its own slow half. A rare big jump after a quiet run is exactly what a catch-up looks like. Real prices and indices often move that way. A next round needs a heavy-tailed version of the honest model, not just a cleaner stretch.

The code ships as an opt-in, so the measurement can be repeated. The tool's sentences are unchanged. Script, seeds, tables and the pre-registration are in the tool's README ("One-tick stale feeds: a likelihood"). Simulated series only, apart from one real check: a rounded price index from the frozen orange juice file still reads as rounding.

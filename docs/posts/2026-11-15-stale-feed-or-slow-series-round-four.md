---
title: "Stale feed or slow series? A fourth pre-registered try finally passes"
seo_title: "Stale data feed or rounded slow series? A likelihood test that passed"
date: 2026-11-15
tags: [changepoint-detection, data-quality, statistics, pre-registration]
description: "Pre-registered round four tells one-tick stale feeds from rounded slow series: 0% false calls on rounded walks, 81-98% of stale feeds caught."
---

When a series repeats its last value more often from some date on, the [changepoint detector](https://marisstella.app/changepoint-detector/) reports it as a change in how often the data was updated. That can mean two quite different things. The feed went stale, so a figure was carried forward while the real value kept moving. Or the series simply slowed down, and a slow series recorded to 0.1 repeats itself because it moves less than one recorded step. The first is a data problem. The second is just how the series behaves.

The hard case is a stale feed whose real moves are themselves about one tick. Three earlier pre-registered rounds failed on it. Two used a ratio of the moves that end a run of repeats, and 300 steps held too few of those moves. The third used a likelihood: a hidden random walk recorded rounded, against the same walk where each step may repeat the last figure. It caught stale feeds but called rounded walks stale 7 to 12% of the time, and called a heavy-tailed slow walk stale 61.5% of the time.

The third round's post hoc found two causes. The stretch handed to the test ran a few steps past the real change, so it ended with fast moves. And a Gaussian walk reads a heavy-tailed series' rare big jumps after quiet spells as catch-ups. Round four changed exactly those two things. It tests the stretch only inside the date range of its change, and gives both models Student t steps, so a big jump can be put down to a heavy tail. The stale model then has to win on catch-ups that grow with the length of the run before them.

The rule, written and committed before the fresh seed ran, used 200 simulated series per cell:

| cell | called stale | bar |
|---|---|---|
| rounded slow walks (3 cells) | 0.0% each | at most 5% |
| one-tick stale feeds (3 cells) | 98.0%, 96.9%, 81.3% | at least 80% |
| heavy-tailed / mean-reverting slow series | 3.0% / 0.5% | at most 10% |

Every line passed, so the check is now on by default. The report now says when repeats look like a stale figure catching up and when they look like rounding. The weak spot is the clumped stale feed (81.3%, just over the bar): long frozen stretches look like a slow walk to both models. All of this evidence is simulated. A real series with documented carry-forward is the next check. Code, seeds and tables are in the tool's README, under "One-tick stale feeds: a heavy-tailed walk".

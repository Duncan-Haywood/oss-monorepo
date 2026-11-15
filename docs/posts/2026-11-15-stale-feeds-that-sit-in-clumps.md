---
title: "Stale feeds that sit still in clumps: catching 97% instead of 81%"
seo_title: "Detecting clumped stale data feeds: a Markov carry-forward test"
date: 2026-11-15
tags: [changepoint-detection, data-quality, stale-data, statistics, pre-registration]
description: "Pre-registered: letting carried-forward repeats clump lifts a clumped stale feed from 80.6% to 96.8% caught; rounded series stay at 1.5% or less."
---

When a series repeats its last value, there are two common reasons. The figure was carried forward because nobody refreshed it (a stale feed). Or the series moved less than its recorded precision, so it rounds to the same number (a slow series). The [changepoint detector](https://marisstella.app/changepoint-detector/) flags changes in how often a series repeats. Since this morning it has also told the two apart, using a likelihood ratio between a rounded random walk and the same walk with some steps carried forward.

That check (round four) had one weak spot: stale feeds whose repeats come in **clumps**. Once a value sticks, it tends to stay stuck for a few steps. Round four's model carried each step forward with a single probability, so it expected short, scattered runs of repeats. A clumped feed looked to it more like a slow walk, and it caught only 81% of them.

**Round five's one change:** the carry-forward now has memory. There is one chance to start repeating after a fresh value and another to keep repeating after a repeat. Whether a repeat was a carry-forward or plain rounding is hidden, so the filter tracks both the hidden value and that flag. When the two chances are equal, the model is round four's exactly.

**The threshold could not come from textbook theory.** With no carry-forward, the "keep repeating" chance means nothing, so the usual chi-square cut-off (5.41) no longer applies. The rule was committed before anything ran. Set the threshold on simulated series that are *not* stale (rounded walks, a heavy-tailed walk, a mean-reverting one), on a seed no earlier round had used, so that at most 2% of each kind clear it. That gave 6.56. Then run once on a fresh seed:

| 200 series a kind | called stale, round five | round four, same series |
|---|---|---|
| rounded slow walks (three speeds) | 1.0% / 0% / 0% | 0.5% / 0% / 0% |
| heavy-tailed / mean-reverting slow series | 1.5% / 0% | 2.0% / 0% |
| one-tick stale feeds, scattered | 98.6% / 100% | 97.8% / 100% |
| **one-tick stale feed, clumped** | **96.8%** (60 of 62) | 80.6% (50 of 62) |

All five pre-registered lines passed, so it is now the default. The report line also names the clumping it found: "after a fresh value the next repeats about A% of the time, after a repeat about B%".

The costs: the test takes about three times as long, and a heavy-tailed stale feed with no clumping is caught 81.5% of the time instead of 83.5%, because the bar is higher. All of this evidence is simulated. The next useful step is a real series whose carry-forward is documented, so a call can be checked against what actually happened.

Code, seeds, the calibration file and the full table are in the tool's README ("One-tick stale feeds: clumped carry-forward").

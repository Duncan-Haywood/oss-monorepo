---
title: "A growth check for slow sales climbs failed its pre-registered test: why a robust z was not a z"
seo_title: "Why a robust z-score failed to detect slow sales climbs"
date: 2026-11-22
tags: [changepoint-detection, statistics, pre-registration, monitoring]
description: "Round 8 of the changepoint watch tested a pulse-in-growth check for x1.3 climbs. It heard 3 more of 150; a short history made its z-scores far too wide."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s watch now runs two checks on a shop's
daily export: the daily watch, and since this morning a weekly watch on whole-week totals that hears a season
building. Together they hear 130 of 150 simulated shops whose sales climb to 1.9 times their level over four to eight
weeks. For a climb to 1.3 times, they hear 89 of 150. That gap was today's question.

## The idea

A slow climb is a few weeks of raised growth. So instead of watching the level, watch weekly growth: sum it over a
window of 2 to 8 weeks, compare that sum with the same sum over the shop's own earlier weeks, and alert when it is
far out of line. Statisticians call a rise that starts and later stops an epidemic change; here the epidemic is in
the growth rate.

We wrote the test down before writing the code: the exact statistic, how its threshold would be set (on 150 separate
unchanged shops, at most 0.10 false alerts per 100 days), fresh test shops from a new seed, and three bars. The main
one: the growth check beside the two shipped watches must hear at least 15 more of 150 x1.3 climbs within eight weeks.

## What happened

The threshold came out at 6, the top of the grid. At that setting the growth check heard 3 more x1.3 climbs (92
against 89) and 5 more x1.9 climbs. It failed the main bar and the bar that asks for a gain at both noise levels,
so nothing in the watch changes.

The reason is the useful part. The check scored each window with a robust z-score: the median and the median
absolute deviation of the same window sum over the shop's earlier weeks. With 8 to 30 overlapping earlier windows,
that spread is itself very noisy. On shops where nothing changes, the largest score in a year has a median of 4.3 and
a 99th percentile of 13.6. A real x1.3 climb reaches a median of 4.0 inside its own eight weeks. No threshold can
separate the two. The score's tails come from the short history it is measured against, not from the shops.

## Also learned

- **The weekly watch replicates.** On the fresh shops, the shipped pair heard 130 of 150 x1.9 climbs (yesterday's
  test: 131) at 1.06 false alerts per 100 days (1.07).
- **Long windows date changes early.** The check dates an alert to the start of the window that scores highest,
  and the longest window that still contains a step scores highest, so it dated a clean step four weeks early.
- **On a real shop** (the UCI Online Retail data), the check at its threshold of 6 sent nothing. At 4 it heard the 2010 autumn
  build-up eight days before the weekly watch did, which is one series and decides nothing.

## Next

A growth check is worth another try only if its score is measured against a noise model, such as the drift
detector's level noise or a bootstrap of the shop's own earlier weeks, so that its false-alert rate is set in advance
rather than found afterwards. The other open question is how close a x1.3 climb over a month or two sits to what
any check can hear at a busy shop's weekly noise.

Everything is in the repository: the pre-registration (`eval/growth-pulse.prereg.md`), the simulation and its
output, the after-the-fact reading (`eval/growth-pulse-why.mjs`) and the tests that pin the verdict.

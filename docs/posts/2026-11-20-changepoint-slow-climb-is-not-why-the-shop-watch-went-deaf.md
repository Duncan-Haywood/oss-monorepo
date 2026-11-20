---
title: "A slow climb is not why our shop watch went deaf: a pre-registered simulation says the opposite"
seo_title: "Ramps vs. steps for a shop revenue change alert"
date: 2026-11-20
tags: [changepoint-detection, statistics, ecommerce, negative-result]
description: "On 300 simulated shops shut every Saturday, a five-week revenue climb was heard 67 times in 100 against 38 for a step, so the real deaf watch has another cause."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a watch: run it on a shop's daily
revenue every morning and it sends an alert when the level moves. On one real online shop, a UK gift wholesaler whose
two years of orders are public (UCI Online Retail), the watch's quietest setting never heard the Christmas build-up,
when revenue climbed from about £26,000 to £50,000 a day between September and November. The shop never trades on
Saturdays. Leaving those zero rows out fixed it on both years. On simulated shops with a sudden +30% step, the same
change gained nothing.

Yesterday's write-up blamed the difference on shape: the real climb takes weeks, and a step does not. Today we tested
that.

## What was fixed before the run

The plan was committed before any simulated shop ran
([`eval/shut-weekday-ramp.prereg.md`](../../ventures/changepoint-detector/eval/shut-weekday-ramp.prereg.md)). It used
the same simulated shop as before, with a fresh seed: a year of days, every Saturday 0, lognormal day-to-day noise, a
weekday pattern, occasional wholesale days and five one-day closures. There were 100 shops with no change, 100 whose
revenue climbs 30% over four to eight weeks, and 100 whose revenue climbs 90%, as the real one did. The watch counts
as hearing a climb if it sends an alert dated somewhere along it, within 14 days of that date.

The first bar tested the explanation itself: with the Saturdays left in, the watch should hear at most 25 of the
+30% climbs. If it heard more, slow climbs are not the problem.

## What happened

| | Saturdays in | Saturdays left out |
|---|---|---|
| +30% climbs heard (of 100) | **67** | 57 |
| +90% climbs heard (of 100) | 73 | 74 |
| alerts per 100 checks, no change | 1.89 | 1.87 |

The watch heard 67 of the +30% climbs, far above the bar of 25. It also beats the 38 of 100 sudden steps it heard
in the earlier round, though some of that comes from the scoring window: a climb can be heard anywhere along its
length, a step only near its date. Either way, a shop whose revenue rises over five weeks with a zero every Saturday
is heard. Leaving the Saturdays out made things slightly worse, not better. The middle setting was not deaf to the
climbs either (58 and 54 of 100).

So the explanation was wrong. Nothing in the product changes: the Saturday drop stays an internal helper, and a shop
owner who wants it can still delete the shut day's rows and set the weekly cycle to six.

## Where to look next

These were read off files already in the repository after the round, so they decide nothing yet. The real year has
heavier tails than the simulation: the spread of its daily log revenue is 0.50 against a robust 0.32. It also opens
with an 11-day Christmas closure. The real watch's late alerts are the most telling sign. One alert is dated April and
sent in August, and the middle setting's only one is dated March and sent in November. The watch noticed that
revenue had moved, but it placed the move months too early. The next round puts the real tails and the long closure
into the simulated shop, to see which one makes the watch misdate the climb.

The full result, with every simulated shop, is in the
[README](../../ventures/changepoint-detector/README.md) under "A shop shut one weekday, round 3".

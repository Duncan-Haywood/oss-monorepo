---
title: "A slope test could not hear a slow revenue climb; weekly totals could, about seven weeks in"
seo_title: "Can weekly totals catch a slow revenue climb a daily alert misses?"
date: 2026-11-21
tags: [changepoint-detection, statistics, ecommerce, negative-result]
description: "A pre-registered round on 600 simulated shops: no slow-climb check passed its bars, but a weekly watch beside the daily one heard far more big climbs."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) watches a shop's daily revenue and alerts
when the level moves. [This morning's round](2026-11-21-changepoint-christmas-closure-did-not-deafen-the-shop-watch.md)
found that its quiet default hears a slow climb worst when the day-to-day noise is calm. Our guess was that it never
hears the climb as such, only single big days on the new level. If that is right, a check built for climbs might hear
what the daily watch misses.

## The test

Before any shop ran, we wrote down the bars ([`eval/slow-climb.prereg.md`](../../ventures/changepoint-detector/eval/slow-climb.prereg.md)).
We simulated 600 shops with Saturdays shut and calm Gaussian noise at two levels, sd 0.2 and 0.36 on a log scale.
A third of them never changed. The rest climbed to 1.3 or 1.9 times their revenue over four to eight weeks. Beside
the shipped daily watch we ran three checks on **weekly totals**: the same watch, the "wandering level" drift watch,
and a slope test that looks for a change in the growth rate.

A climb counted as heard if an alert pointed at it and arrived by two weeks after it ended. To pass, a check had to
hear the small climbs at least 15 more times in 100 than the daily watch, at both noise levels, and add little to
the false alarms.

## What happened

No check passed. The slope test sent no alert at all, true or false, in 600 shops. A climb that levels off is a
short burst of growth followed by none. The test is built for growth that changes and stays changed. Working on
week-to-week differences also roughly doubles the noise. On a clean five-week climb to 1.9 times, its score peaked
at about 5 against a bar of 8.5.

The weekly watches did better on the big climbs, and that is the useful part:

| sd 0.36 noise | daily alone | daily + weekly drift |
|---|---|---|
| climbs to x1.9 heard (of 100) | 57 | 82 |
| false alerts per 100 days | 0.25 | 0.31 |

At sd 0.2 the same pair heard 90 of 100 against 51. That costs about one more false alert a year. The catch is
timing. The weekly watch's median alert came 49 days after the climb began, near its end. On the small x1.3 climbs
neither weekly watch beat the daily one.

One more surprise: calmer noise was worse again for the daily watch. At sd 0.2 it heard fewer big climbs than at
0.36 *and* sent more false alerts, so this morning's "catches follow the false-alert rate" does not hold across noise
levels.

## What changes

Nothing ships, because the bars were the bars. But a shop owner can already do what the winning pair did: export
weekly revenue and run the watch with `--detector drift` on it, beside the daily watch. The next round tests that pair on
fresh shops, with bars on how many big climbs it hears within eight weeks. Full tables:
[README, "round 6"](../../ventures/changepoint-detector/README.md).

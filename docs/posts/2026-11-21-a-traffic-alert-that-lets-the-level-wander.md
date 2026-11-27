---
title: "A traffic alert that lets the level wander, and the small falls it pays for"
seo_title: "Search traffic change alerts that ignore random drift"
date: 2026-11-21
tags: [change-detection, search-console, monitoring, statistics, pre-registration]
description: "A wander gate cut alerts on drifting traffic from 13.75 to 3.54 per 1,000 days but heard small falls later on calm sites, so it ships as an opt-in."
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

The [change watch](../../ventures/changepoint-detector/watch-a-metric-for-changes.html)
reads a daily count (Search Console clicks, Shopify orders) each morning and
says when it has shifted. Its "Middle" setting for counts hears most 20% falls,
and since this morning it lets a site grow steadily without alerting. A level
that wanders at random was still its weak point. Traffic drifts with seasons,
news and competitors, and a step detector reads that drift as a staircase. Each
new stair is an alert nobody needs.

## The idea

The repository already has a model for wandering levels: a random-walk level
with jumps on top. The new gate fits it twice to the log counts, once with the
wander free and once with no wander at all. Weekdays and any steady growth
come out first. If the wandering fit wins by more than log n, the level really
does wander. Then a change the step detector found is kept only if the
wandering model also needs a jump there. If the gate stays shut, nothing changes.

Tuning it on probe seeds took three tries. With no growth taken out, it opened
on almost every growing site and missed a fall on one. A one-step median slope
is as noisy as the counts, so it opened the gate everywhere. A long-lag slope
took a big fall for growth. The version that shipped reads the slope only from
pairs of days that don't straddle a jump.

## The test, written down first

The bars were committed before the run: fresh seeds, 120 days of daily checks
per site, about an hour on four cores.

| simulated sites | Middle | Middle + wander gate |
|---|---|---|
| level wanders 2% a day: alerts per 1,000 days | 13.75 (37 of 40 sites) | **3.54** (15 of 40) |
| level wanders 1% a day | 5.42 | 3.75 |
| traffic doubles over 240 days | 3.33 | 0.83 |
| grows, then falls 20%: falls heard | 40 of 40 | 39 of 40 |
| flat counts: false alerts per 1,000 checks | 1.86 | 1.72 |
| steps found of 360 | 346 | 345 |
| calm sites (cv 15%): extra days to hear a fall | | +0.68 (0.12 to 1.42) |

Seven of the eight bars passed. The one that failed was the cost bar: on calm
sites the gate sometimes opened and read a slow 10% fall as wander. The
interval's upper end, 1.42 extra days, went over the 1.0 we had allowed. So
Middle stays as it was, and the gate ships as an option, `--wander gated`.
Use it when alerts about drift cost you more than hearing a small fall a day
later.

These are simulated sites, and the weekday adjustment only covers a weekly
cycle. The next step is a gate that stays shut on calm sites with slow falls,
then a check on a live Search Console property. The method, every number
and the pre-registration are in the
[README](../../ventures/changepoint-detector/README.md), section "A wandering
level under Middle".

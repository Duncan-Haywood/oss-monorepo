---
title: "Same number of days, different days: a guard that stops a feed check calling a reshuffle a return"
seo_title: "A direction guard for short returns to daily reporting"
date: 2026-11-19
tags: [changepoint-detection, statistics, data-quality, negative-result]
description: "A half-share guard cut false returns on day-shifted schedules from 100% to 0 with no loss of power. On eight real COVID returns it dated 2; the bar was 4."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has an update-rate check. It reads a series' repeated values and says when the feed started updating more or less often. For four rounds it has been trying to see a short *return*: a provider that goes back to daily figures for two months, then stops again. [Round 4](2026-11-18-changepoint-weekday-cost-short-returns.md) passed every simulated bar and then dated only 3 of the 8 returns that Johns Hopkins documented in US states' COVID-19 reporting. The bar was 4.

Round 4's own list of what it found pointed at the problem. Five of its twelve "returns" on real state series had the same share of repeated days inside as around: 85% and 85%. Those weren't returns to more frequent publication. The states had changed *which* days they published (Tuesday and Friday became Monday and Thursday, say). The weekday model sees any change of weekday pattern as something worth cutting out. The pass's only check on direction was "fewer repeats inside", and a hair fewer was enough.

## Round 5

Before any simulated series ran, I committed [the eval file](../../ventures/changepoint-detector/eval/update-rate-returns-guard.mjs) with:

- **four new null cells** that keep the number of publishing days and move them: Tuesday/Friday to Monday/Thursday, and Wednesday to Monday, each for 60 days or for good;
- **two guards** inside the search: `half` (the repeat share inside is at most half the share around) and `z01` (a one-sided test that the drop is significant at 1%);
- every earlier cell and bar, plus R4: at most 0.010 false returns a series on the new cells.

I'd already seen round 4's real shares when I wrote the guards. I knew that Michigan's documented return (58% repeats inside, 66% around) would fail `half`. So the header says so, the choice between guards was made on simulation only, and the real check could only refuse.

## What happened

The new nulls caught the flaw straight away. Round 4's pass called a return on 98 to 100% of the day-shifted series. `half` took that to zero at every penalty and cost nothing anywhere else. On the same series its power matched round 4's exactly. `z01` let 5% of the Wednesday-to-Monday shifts through and met the budget only at a penalty where thirty-day returns can't be found.

| confirmation seed | `half`, m 3 | round 4, m 3 |
|---|---|---|
| false returns, worst day-shift cell | 0.000 | 1.000 |
| false returns, worst of all null cells | 0.005 | 1.000 |
| 60-day returns found, of 200 | 196 | 196 |
| 30-day returns found | 159 | 159 |

All four simulation bars passed. Then the real check: **2 of 8**. Idaho and Vermont were dated as before. Michigan dropped out, as the header said it would: going from two to three publishing days a week cuts the repeat share from about 71% to 57%, which isn't a halving. The pass stays off and nothing the tool prints changes.

## What the real series say

This part is post hoc and decides nothing. On the 27 states, the guard cut the list of returns from 12 to 6, and each one left is a real drop: 0 to 20% repeats inside against 24 to 43% around. So the guard does its job on real data too. What it can't do is find returns the pass never proposed.

The other five misses aren't two-month returns at all. By the documented dates, Alaska's move to more days lasted about four months, South Dakota's eight and Alabama's five and a half, and Arkansas and Nebraska have no listed end. Those are lasting schedule changes, which the main check should cut, and it misses them too. The real-data bar mixed two questions. The next round asks the one that matters more: why the main check misses a feed that goes from Wednesdays only to every weekday and stays there for months, with simulated cells that no round has tried yet.

Full tables: the README section ["Short returns: a real drop in repeats"](../../ventures/changepoint-detector/README.md).

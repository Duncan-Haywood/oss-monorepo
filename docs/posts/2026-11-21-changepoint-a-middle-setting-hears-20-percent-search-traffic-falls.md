---
title: "A middle alert setting hears 20% falls in search traffic that the quiet one missed"
seo_title: "Hearing a 20% drop in Search Console clicks without false alarms"
date: 2026-11-21
tags: [changepoint-detection, statistics, seo, search-console]
description: "Pre-registered, on simulated sites: PELT with a negative-binomial cost heard 115 of 120 falls of 20% in daily clicks, under one false alert per 1,000 days."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) can watch a site's daily Google clicks
and send a message when they fall. [This morning's Search Console source](../../ventures/changepoint-detector/README.md#google-search-console-as-a-source-2026-11-21)
came with an awkward table. Its quiet default heard a 40% fall in about four days, but only 13 of 60 falls of 20%. The
eager setting heard nearly everything, but it also sent 39 to 148 false alerts per 1,000 days, about one a week on a
busy site. A site owner who cares about a 20% slide had no good setting to choose.

## Why the eager setting cries wolf

Daily clicks move around more than a simple count model expects. A simple count model (Poisson) says a site averaging
400 clicks a day should rarely see a day outside about 360 to 440. Real traffic also swings with news, weather and
weekends, so a 15% wobble from one day to the next is ordinary. The eager setting (PELT with a Poisson cost) reads
those wobbles as changes. The quiet setting allows for them, but it wants to be very sure before it speaks.

The fix to try was obvious: keep PELT, but score each segment with a negative-binomial cost, which expects counts to
swing more than Poisson does. We tested it the way this project tests its defaults, with the rules written before any
of the runs ([`eval/gsc-middle.prereg.md`](../../ventures/changepoint-detector/eval/gsc-middle.prereg.md)).

## Three stages, three sets of seeds

**Tuning.** Five candidates ran on 20 simulated sites per cell: 50, 400 or 3,000 clicks a day, weekends at 70%, day
swings of 15% or 30%, and a lasting fall of 10, 20 or 40% on day 180, or none. The rule kept the candidates with at
most 2 false alerts per 1,000 days and picked the one that heard the most 10% and 20% falls. PELT with the
negative-binomial cost won, with 161 heard. The windowed Bayesian pass at lower thresholds either heard little or, at
30% swings, sent 4 to 10 false alerts per 1,000 days.

**Fresh sites.** On 40 new sites per cell, against the quiet default:

| day swings | setting | false alerts per 1,000 days | 20% falls heard | median days to the alert |
|---|---|---|---|---|
| 15% | quiet default | 0.17 | 38 of 120 | 5 |
| 15% | **middle** | 0.83 | **115 of 120** | 8 |
| 30% | quiet default | 0.58 | 17 of 120 | 7 |
| 30% | **middle** | 1.33 | **88 of 120** | 16 |

It heard the 40% falls just as fast as the quiet default did, and it caught 73 of 120 falls of 10%. Those took about a
month, so a slow slide is still a job for reading the rows.

**The hint.** The tool can also read your own history and suggest a setting. We reran that test on 2,200 fresh
simulated shops, with the middle added as a third rung. It heard 49 more of 1,200 real steps (36 to 62 in a bootstrap
interval) for 0.37 more false alerts per 1,000 checks, and it passed all four of that test's bars. The gain came from
bunched counts. There the old hint fell back to the quiet default, because the eager setting was over budget.

## Two things the round did not settle

The middle is slower on the falls both settings hear: 8 days against 5 for a 20% fall. And in the hint round, the
middle on its own, with no hint, beat the hint on both counts: fewer false alerts and more steps. Making it the
default was not what this round tested, so the default stays where it is. That is the next round, with the delay on
the table.

On the one real shop we replay (UCI's Online Retail orders), the hint now picks the middle when the weekly cycle is
modelled. Its replay alerts at Easter and on 2011-09-19, partway up the autumn climb that the quiet default misses.
That is one shop, and the labels are our own reading of it.

## Using it

On the [page](../../ventures/changepoint-detector/index.html), pick "Middle" in the watch card's How eager box for a
counts column. In the self-hosted daily workflow, set
`WATCH_OPTIONS="--columns clicks:poisson,impressions:poisson --detector pelt --overdispersion nb"`. All of this was
measured on simulated sites, not on a live Search Console property. A deployer's first weeks will be the real check.

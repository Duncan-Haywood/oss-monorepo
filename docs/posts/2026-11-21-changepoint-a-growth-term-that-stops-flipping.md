---
title: "Why a traffic alert kept firing on healthy growth, and the fix that passed"
seo_title: "Stopping a traffic alert from firing on healthy growth"
date: 2026-11-21
tags: [changepoint-detection, statistics, seo, pre-registered]
description: "A growth term that switched on and off from day to day caused the false alerts. Refitting it under the steps cut alerts on growing sites from 27 of 40 to 6."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) can watch a site's daily clicks or a
shop's daily orders and alert when they fall. Its "Middle" setting for counts hears most 20% falls that the quiet
default misses. It also used to alert on healthy growth, because it assumes the level is flat between changes. A
steady climb then looks like a staircase, and every new stair sends an alert.

[This morning's round](2026-11-21-changepoint-a-growth-term-cuts-false-alerts-on-growing-sites-by-a-third.md) added a
cheap growth term to Middle. It cut those alerts by a third and still failed its bar. This round started by asking
why.

## The growth term kept switching on and off

The cheap growth term reads one growth rate from the log counts and keeps it only when it beats a flat level by a
margin. We logged that decision on every daily check, for three simulated sites growing 30% over 240 days. The term
was kept on 57, 87 and 103 of 121 checks, and it **switched on or off 25, 21 and 11 times**. On each day it was off,
the climb was fitted as a staircase again, and the newest stair alerted.

The growth rate was read once, before any steps were fitted, so it was noisy. Its fit sat right at the margin and
fell either side of it from one day to the next. The full joint fit estimates the growth rate *together with* the
steps, by alternating the two. It fits better, so it clears the margin more steadily. We kept the margin (the
"gate"), because a probe without it sent more alerts on flat sites.

## The round

The rules were written before the runs ([`eval/middle-trend-joint.prereg.md`](../../ventures/changepoint-detector/eval/middle-trend-joint.prereg.md)),
on fresh seeds, with the same bars as the round before:

| | default | Middle | cheap growth term | joint growth fit, gated |
|---|---|---|---|---|
| sites growing 30%: alerted, of 40 | 2 | 27 | 14 | **6** |
| sites doubling: alerted, of 40 | 1 | 40 | 21 | **10** |
| flat sites: days unaware per fall (cv 15%) | 37.1 | 20.1 | 20.2 | 20.2 |
| flat counts: false alerts per 1,000 checks | 1.17 | 1.92 | 1.89 | 1.81 |
| growing site that falls 20%: falls heard, of 40 | 3 | 36 | 36 | **37** |

Every bar against Middle passed. On growing or shrinking sites the joint fit removes about four fifths of Middle's
alerts, and on flat sites it behaves like Middle, giving back under a day per fall. So it is now what "Middle" means
for counts: on the page, in the "How eager" hint, and in `--detector auto`. On the command line it is `--trend gated`.

It did not become the default, because it failed one bar against it: on flat counts it sends about 0.6 more false
alerts per 1,000 checks than the quiet default (the limit was set at 1.0 on the interval's upper end; it reached
1.03).

## What it still gets wrong

A level that **wanders at random** is not a straight line, and one growth rate cannot follow it. On those simulated
sites the new Middle still alerted on 20 of 40 (a 1% daily wander), barely better than before. That is the next
round.

There was one real check, on a real shop's daily orders, and it decided nothing. The new Middle sends 5 alerts in the
year instead of 7, and the hint now picks it. But two of the dropped alerts sat inside an autumn build-up that a person
reading the series would call real. Treating growth as normal means a slow real rise also gets read as growth.

These are simulated sites. Every cell:
[README, "The joint growth fit, gated"](../../ventures/changepoint-detector/README.md#the-joint-growth-fit-gated-2026-11-21-pre-registered-every-h-bar-passes-it-becomes-the-count-middle).

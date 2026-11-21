---
title: "A growth term cut false alerts on growing sites by a third, and still was not enough"
seo_title: "Can a growth term stop a traffic alert firing on steady growth?"
date: 2026-11-21
tags: [changepoint-detection, statistics, seo, negative-result]
description: "A pre-registered round on 3,400 simulated series: a gated growth term kept Middle's hearing on falls, cut its growth alerts by a third, and failed its bar."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) can watch a site's daily clicks and alert
when they fall. Its "Middle" setting (PELT with a negative-binomial cost) hears most 20% falls that the quiet
default misses. But [this morning's round](2026-11-21-changepoint-the-better-alert-setting-is-not-the-better-default.md)
found that it also alerts on healthy growth. PELT assumes a flat level between changes, so it fits a steady climb
as a staircase, and each new stair sends an alert.

The obvious fix is to let the level grow. This round tested a cheap version of that.

## What we tried

The new option is `--trend robust`, for counts. On each daily check it reads one growth rate from a robust slope of
the log counts and looks for steps around that line instead of around a flat level. We added a gate before the
round. The growth term is kept only if it beats a flat level by a BIC margin (log n). The reason was a probe: without
the gate, a slightly wrong slope on a flat site got patched with extra steps, and those steps became extra alerts.

The rules were written down before the runs ([`eval/middle-trend.prereg.md`](../../ventures/changepoint-detector/eval/middle-trend.prereg.md)).
The bars were: no more than two extra days unaware per fall compared with Middle, no more false alerts on flat
series, and on sites growing 30% over 240 days no more than 3 alerts per 1,000 days above the default. Every seed was
fresh.

## What happened

| | default | Middle | Middle + growth term |
|---|---|---|---|
| days unaware per fall, flat sites (cv 15%) | 35.2 | 19.3 | 19.7 |
| false alerts per 1,000 days, flat sites (cv 15%) | 0.17 | 0.81 | 0.72 |
| alerts per 1,000 days, growing 30% | 0.83 | 9.79 | **6.25** |
| alerts per 1,000 days, doubling | 0.00 | 15.42 | 5.83 |
| growing site that falls 20%: falls heard of 40 | 6 | 36 | 38 |

On flat sites the new option behaves almost exactly like Middle and gives
back less than half a day per fall. On sites that grow or shrink steadily it removes a third to two thirds of
Middle's alerts. On a growing site that then falls, it heard more of the falls, heard them sooner, and sent fewer
false alerts before them. But 6.25 alerts per 1,000 days on a gently growing site is still well above the default's
0.83. The bar was 3.83, so the option failed.

It did not help on sites whose level wanders at random (a random walk). That makes sense: one growth rate is a
straight line, and a wander is not.

## What ships

The defaults don't change. `--trend robust` ships as a documented option on the analysis CLI and the watch, with
these numbers beside it. Use it if you run Middle on a site you know is growing and the extra alerts are the
problem. The next round tries the full joint fit, which re-fits the growth rate together with the steps. It was too
slow for a round of this size (about 0.2 s per check, against Middle's 0.04 s).

These are simulated sites, not real Search Console data. Details, including every cell:
[README, "A Middle that allows for growth"](../../ventures/changepoint-detector/README.md#a-middle-that-allows-for-growth-2026-11-21-pre-registered-fails-its-growth-bar-ships-as-an-option).

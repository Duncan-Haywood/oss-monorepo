---
title: "Plan on one sunlight product, sail under another: a solar boat's learned correction earns its keep"
seo_title: "Solar USV: plan on NASA POWER, sail under ERA5"
date: 2026-11-16
tags: [research, marine-hull]
description: "A solar boat planning on NASA POWER but sailing under ERA5 sun: no correction wins 3 of 168 cases, one season of learned ratios 45, the guard 67."
---

This morning's [marine-hull](../../research/marine-hull/) step reran a solar survey boat's sun-correction rules with [ERA5](https://doi.org/10.1002/qj.3803) sunlight in place of NASA POWER. ERA5 was used for everything: the climatology the boat plans with, the year it learns from and the years it is scored on. Every ranking held, but the high-latitude advantage of learning a correction from one season of log shrank by a third to a half.

That test put the boat in a different, self-consistent world. A deployed boat is never in one. It plans with a product, a climatology downloaded before the mission, and its panels see the real sun, which no product reproduces exactly. So this run splits the two. The boat plans with NASA POWER's 2015 to 2024 climatology, while its panels, its logged learning year and its scored years see ERA5. At the nine high-latitude points ERA5 runs 2% to 22% brighter than NASA, so the boat starts every mission with a climatology that is too dark.

## What we ran

The code, boat, battery sizes, 21 climatology bias shapes, five learning years and scoring rule were all unchanged. A rule "wins" a case when the boat covers at least the distance of a plain 7-day trailing-mean rule, with no more hours on a flat battery. The pooled count runs to 168. The eight predictions were [committed before the run](../../research/marine-hull/experiments/run_cross_source.py), and the same script reproduced the earlier NASA-only and ERA5-only counts exactly as checks.

## What came out

| Rule | NASA throughout | ERA5 throughout | Plan NASA, sail ERA5 |
|---|---|---|---|
| No correction | 25 | 29 | **3** |
| Raw learned month ratios (mean of 5 learning years) | 81.0 | 57.4 | 45.2 |
| Dark-summer guard | 109.2 | 75.6 | 67.4 |
| Guard gated on a replay of the logged year | 85.8 | 68.2 | 53.2 |
| Lead of raw ratios over no correction | +56 | +28 | **+42** |

Seven of the eight predictions held ([results](../../research/marine-hull/experiments/results_cross_source.txt)).

**No correction collapses.** It wins 3 of 168 cases, and every case it loses, it loses on distance. A plan built on a darker sky than the one the boat meets makes it too cautious, and the 90-day running ratio the uncorrected rule uses does not catch up within the season.

**One season of log mostly fixes that.** The learned month ratios average 1.044 here, against 0.995 when ERA5 is used throughout. They absorb most of the level difference between the two products, and the correction's lead over no correction grows from +28 to +42 cases. The dark-summer guard leads by 64.

**The clamp is now the limit.** The learned ratios are clamped to ±15%. In the mismatched world 24% of learned months sit at the upper clamp, against 7% with ERA5 throughout.

**Per point it is a wash.** On the real climatology scored point by point, the raw ratios beat no correction by less than half a case (35.4 against 35 of 72).

## What it means for a designer

Part of what this programme had been calling the high-latitude seasonal advantage of a learned correction is plainer than that. It is a level correction, and any boat whose climatology product is biased against its own panels would gain from it, at any latitude. The next step separates the two. It will compare a correction that learns only the annual level with the month-by-month one, and check what a wider clamp buys, with both fixed before the run. It will also run the reverse mismatch, a plan brighter than the sea. One honest caveat: ERA5 is standing in for the real sun here, so this measures a product-to-product mismatch. A buoy or ship pyranometer would show the product-to-truth one.

The code is MIT licensed and stdlib-only, and it reruns in under fifteen minutes on four cores. It is all in [`research/marine-hull`](../../research/marine-hull/). The log entry is milestone 6zzv.

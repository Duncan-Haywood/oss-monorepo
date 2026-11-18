---
title: "Two kinds of clumpy counts: the changepoint detector now tells them apart"
seo_title: "NB1 vs NB2 overdispersion in changepoint detection"
date: 2026-11-16
tags: [changepoint-detection, statistics, pre-registration, count-data, negative-binomial]
description: "Counts that clump in proportion to their level broke the detector's one-size negative binomial. An NB1 cost and a law check cut false changes by about 60%."
---

Count data is rarely Poisson. Orders, calls and claims arrive in bunches, so their spread is wider than their mean. The [changepoint detector](https://marisstella.app/changepoint-detector/) handles that with `--overdispersion nb`, a negative-binomial cost. That cost assumes one particular shape of clumping, though, and some real counts have another.

## Two laws of clumping

The usual negative binomial (statisticians call it NB2) says the variance is the mean plus the mean squared over a size r. At low levels that is close to Poisson. At high levels the clumping dominates. A second version, NB1, says the variance is a fixed multiple of the mean. Counts that arrive in batches of a typical size follow it: a warehouse that ships pallets of about 3 boxes has three times the Poisson spread whether it ships 10 boxes a day or 1,000.

On a flat series the two are hard to tell apart, and it doesn't matter, because one r can match one phi at one level. Once the level moves a lot, one r can't follow. It overstates the spread where counts are high and understates it where they are low, so the quiet stretch sprouts false changes. I measured that before writing any fix. On NB1 counts climbing 100-fold, with no change in them at all, the NB2 cost found 0.38 to 0.68 false changes per series. That is 4 to 7 times its rate when its own law is right.

## What shipped

- **`--overdispersion nb1`**: the NB1 likelihood itself, which also works with a season or a growth trend. Its rate has no closed-form maximum, so each segment's estimate is refined by a Newton step on the exact score. It runs about 2.5 times slower than `nb`.
- **A law check**: both laws are fitted to the same neighbour differences. The right law leaves the scaled differences equal on the low and high halves of the level. The output says `nb1`, `nb2` or `either`, and the page warns when the other setting fits better.

I wrote six pass/fail bars before running the fresh seeds. While building on separate development seeds I found a bug of my own: the growth-trend fit subtracted a term the NB1 likelihood already contains, so a bend won on every straight ramp. Fixing that was a correction, not tuning. On those development seeds one cell still missed its bar (0.30 false changes against 0.2). I left the bar where it was and let the pre-registered run decide. All six held:

| 100 series of 200 counts per row | NB2 cost | NB1 cost |
|---|---|---|
| NB1 counts, 7 to 700, false changes per series | 0.45 | **0.19** |
| NB1 counts, 2 to 200, false changes per series | 0.47 | **0.15** |
| a 1.6x step found within 5 points | 100 | 100 |
| NB2 counts, false changes per series | 0.15 | 3.50 |

The law check named NB1 on 94 of 100 NB1 ramps in each cell and never named NB2 on them. It named NB2 on all 200 NB2 ramps.

The last row is why `nb` stays the default. Using NB1 on NB2 counts costs more than the reverse, so `nb1` is opt-in and the law check says when to switch. Still missing: a real count series known to clump in proportion to its level, to check the simulations against. Call-centre arrivals that come in batches would do, or claims per storm. All the numbers, the bars and the bug are in the project's README and `eval/nb1-preregistration.md`.

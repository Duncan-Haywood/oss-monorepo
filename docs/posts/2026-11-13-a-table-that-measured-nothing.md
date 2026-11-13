---
title: "A results table that measured nothing, and what the real numbers say"
seo_title: "Changepoint detection on GARCH noise: a corrected measurement and a failed pre-registration"
date: 2026-11-13
tags: [changepoint-detector, statistics, garch, volatility, negative-result, research-integrity]
description: "An 11-day-old table in our changepoint detector's README came from a script whose likelihoods were all NaN. Fixed, the idea works better than the table said, and still not well enough to ship."
---

The free [changepoint detector](https://marisstella.app/changepoint-detector/) answers one question: did this series really change, and when? One hard case is clustered volatility. Daily returns, server latencies and many sensor feeds have calm spells and wild spells with no lasting change in between. A detector that models each segment as having its own mean and variance reads a wild spell as a break. On simulated GARCH(1,1) noise with no change at all, plain `meanvar` reports a change about half the time.

On 2 November an earlier session tried a fix. It takes the detector's cuts as candidates, models the noise inside each segment as GARCH with parameters shared across segments, and drops any cut the GARCH model explains nearly as well without it. Its README table said the idea barely worked: at n = 200, false alarms went from 50% to 48% even at a very heavy penalty.

## The bug

That table measured nothing. The detector returns each change as an object (`{ index, label, range95, ... }`), and the pruning function wanted plain index numbers. Handed objects, every slice of the series came out empty, every likelihood was `NaN`, and the "pruned" column was whatever comparisons against `NaN` happened to leave. No error was thrown, so the numbers looked plausible.

Today's run found it by printing ten cases and seeing cuts survive that no likelihood could support. The fix is one `.map(c => c.index)`. The function now throws if it gets anything but integers, and a test checks that it keeps a real variance break and drops false cuts.

## The real numbers

Re-run on the same seeds (100 series per cell, so in-sample), the idea works far better than the withdrawn table said. With a per-cut penalty of 1.5 ln n, GARCH false alarms at n = 200 fall from 50% to **9%**. The shipped `--bootstrap` option gets 16%. Mean shifts are found more often too.

The cost is the thing the detector exists to find: a real, lasting jump in variance. A shared GARCH model can partly explain a step as a long volatile spell. At a heavier penalty the true sd 1 to 2 break survives only 4% to 11% of the time.

## A pre-registered test, and a failure

The obvious guess was that high-persistence GARCH settings (a + b near 1) do the absorbing, so capping the grid at 0.9 should keep the step. Before running anything we wrote down the settings (penalty 1.5 ln n, cap 0.9), fresh seeds, and a four-line bar measured against `--bootstrap` ([the pre-registration](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/meanvar-garch-segments-prereg-2026-11-13.md)).

It failed on two of the four lines. False alarms on GARCH noise came in at 10% (pass). But the variance break on GARCH noise was found exactly once 55% of the time, against a bar of 74%, and on Gaussian noise at n = 100 it was 74%, against 80%. The guess was mostly wrong as well. Without the cap the break is found 54% of the time, so persistence is not what eats it. The prune is removing true breaks that the plain fit had found.

So nothing ships, and `--bootstrap` stays the recommendation for volatile series. The next idea is to read the prune's penalty off a block bootstrap of the series itself, the same way `--bootstrap` sets its own.

## Why write this up

A wrong negative result does more damage than a missing one. It closes a door. The 2 November table told later sessions that the segment-wise GARCH route was nearly dead. It isn't: it is the best false-alarm rate on clustered volatility anyone has measured here, with one known cost. Everything is in the [README section](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md) and `eval/meanvar-garch-segments.out.txt`. All of it is simulated noise.

*The changepoint detector is free and open source (MIT). Its results are statistical estimates, not professional advice.*

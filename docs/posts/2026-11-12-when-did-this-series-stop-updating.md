---
title: "When did this series stop updating? A date range for a stale feed"
date: 2026-11-12
tags: [changepoint-detector, time-series, data-quality, pre-registration]
description: The changepoint detector now dates when a series began repeating its last value more or less often. Dating to the step failed its rule; a date range passed.
---

Earlier today a [stale probability per segment](2026-11-12-a-stale-rate-per-segment-finds-the-wrong-change.md) failed as a way to find level changes in sticky series. It did date a change in *how often* a series updates, 103 times in 120. That is worth knowing in its own right. A price feed that goes stale, a figure carried forward month after month, or a change in how data was collected all shows up first as a change in how often a value repeats.

So the [changepoint detector](https://marisstella.app/changepoint-detector/) now has a separate check for it. Take the 0/1 series "this step repeats the previous value exactly" and find the stretches where that behaves steadily. Each stretch is a small two-state chain, so a quote that sits unchanged for months (long flat runs) is not mistaken for a change of rate.

**First rule, failed.** We wrote the rule down and committed it before any run. The setting was chosen on one simulated seed: a chain cost at twice the usual penalty. A cost that treats repeats as independent needed four times the penalty to stay quiet once flat runs clump. On a fresh seed false changes stayed at or below 0.005 a series in all 18 no-change cells. But the rule also wanted the date within 5 steps. It got 179 of 200 on a 10%-to-60% switch (180 needed) and 121 of 200 on a clumped stale feed that gets fixed (150 needed). A look at another seed showed the misses were mostly dates 6 to 20 steps early. The last flat run before a switch ends at random, so the data cannot say to the step when the rate changed.

**Second rule, passed.** A description should then give a range, so the next rule asked for one, again written down before it ran. Each change now gets every position whose two-stretch fit is within a slack of the best. The slack was picked on one seed and checked on others. The range held the switch **200 of 200** times on the 10%-to-60% cell (median width 17 steps) and **181 of 200** on the fixed stale feed. False changes were at most 0.010 a series.

On real data it stays quiet where it should. It speaks on 3 of the 38 Turing Change Point Dataset series, all of them sticky ones whose repeat share actually moves. It says nothing on `bank` or `ratner_stock`, which are sticky at a steady rate. On Florida frozen orange-juice prices it says repeats fell from **60% of months before about August 1981 (between September 1980 and April 1982) to 12% after**. That explains a puzzle from the last few runs: four models of the repeats all lost the smaller freezes before the 1980s. Most of those months were carried forward.

The check runs with `--model drift` in the CLI, on the page and in the printed report. It only describes the data and does not move any jump. Details and every number: the [README section](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md#when-a-series-starts-updating-less-often-2026-11-12-pre-registered-ships-as-a-description).

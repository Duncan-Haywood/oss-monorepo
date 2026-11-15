---
title: "One year of a solar boat's log: fit a yearly cosine, not twelve months"
seo_title: "Solar USV sun-forecast error from one year: fit a yearly cosine"
date: 2026-11-15
tags: [research, marine-hull]
description: "Three numbers learned from one season of a solar boat's log beat twelve monthly corrections, shrunk or not. With two years they match no correction."
---

A solar boat plans its battery use from a sun climatology, and that climatology is a little wrong in a seasonal way. The [last step](2026-11-14-marine-hull-solar-boat-shrunk-seasonal-correction.md) tried to learn the error from one year of the boat's own log. It pulled each learned month toward the year's average ratio (empirical-Bayes shrinkage). That made a one-year correction harmless on ordinary water, but it still trailed no correction at all. It also threw away real seasonal error at high latitude, because a flat prior treats twelve months as unrelated.

This step gives the prior the right shape. Fit one yearly cosine (three numbers: level, amplitude and phase) to the twelve month ratios. Then either use the cosine alone, or shrink each month toward it. We wrote eight predictions down before running anything. The rerun covered the same 168 cases (30 ocean points, NASA POWER daily sunlight 2005 to 2014, four battery sizes, the climatology's real error plus 20 added seasonal biases). Three predictions held.

What came out:

- **The cosine alone is the best one-year rule so far.** It beats the plain 7-day rule (further, with no more payload downtime) in 126 of 168 cases. Raw months score 97, the flat-shrunk months 110, and no correction 139. On the climatology's real error it wins all 8 pooled cases, and point by point 134 of 240 against 126 for no correction.
- **Two years are enough.** The cosine from two years wins 140 of 168, the first learned correction to match no correction (139) with that little history. Raw months needed three. From five years it wins 161, the best count of any rule in the programme.
- **Shrinking toward the cosine is worse than using it.** Letting each month keep part of its own deviation adds that year's weather back: 106 of 168 against the cosine's 126. It pays only where the seasonal error is large. At the nine points above about 50 degrees, two years of it win 142 of 168, against 25 for no correction.
- **One year is still not quite enough.** The fitted amplitude from one year is a median 4.4% against 2.3% from five, so a single season's weather still leaks into the cosine.

For anyone building a solar boat's energy manager: after a season at sea, fit a yearly cosine to the ratio of logged harvest to forecast and scale the forecast by it. Don't keep twelve monthly numbers. After two seasons it is at least as good as no correction. At high latitudes, use the cosine plus partly shrunk months.

The next test shrinks the cosine's own amplitude by its standard error, so a one-year fit stops overstating the season.

Limits: the added biases are pure cosines by construction, which favours this fit, so the 8 real-error pooled cases and 240 per-point cases are the fair test (they agree). History length and recency are still mixed. Simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzd). Written with AI assistance.

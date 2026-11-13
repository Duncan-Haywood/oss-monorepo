---
title: "Changepoint ranges that hold on clustered volatility, and a t-GARCH that missed its bar by four points"
seo_title: "GARCH changepoint ranges: 93-98% coverage, and a failed t-GARCH"
date: 2026-11-13
tags: [changepoint-detection, garch, statistics, pre-registration, negative-result]
description: "Pre-registered: GARCH-fit changepoint ranges hold the true date 93-98% of the time, up from 75%. A t-GARCH cut false alarms to 3% but failed one line."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a `--garch` option for series whose volatility comes in clusters, like daily returns. It finds the dates where the level or volatility changed beyond what the clustering explains. Today it got two pre-registered tests: one shipped, one did not.

**Ranges from the model that chose the cuts.** Each change comes with a 95% range of likely dates. For `--garch` those ranges were computed from a simpler independent-noise model, and the tool warned they were "too narrow". Nobody had measured how narrow. Now the range comes from the GARCH likelihood itself. On 400 fresh simulated series per cell, among series where the search found the one planted change:

| change | old range holds the date | GARCH range holds the date |
|---|---|---|
| volatility doubles, 200 points | 77% | 93% |
| volatility doubles, 400 points | 75% | 98% |
| mean shift, 200 points | 94% | 97% |
| mean shift, 400 points | 92% | 96% |

So the old warning was right: a quarter of the time the old range missed when volatility actually rose. The new ranges are wider for volatility steps (26 to 37 points against 14 to 15) and the same 6 points for mean shifts. On real DAX returns, the late-1990s rise in volatility goes from a 27-day range to one spanning most of the series. Under the GARCH fit the data can say volatility ended higher, but not when it rose. That is an honest answer, not a bug.

**Heavy tails: a near miss.** `--garch` assumes Gaussian shocks inside the clustering, so a single fat-tailed move reads as a change. On Student t noise with 3 degrees of freedom it raised a false change on 38% to 54% of series. Allowing t-distributed shocks (t-GARCH, Bollerslev 1987) brought that down to 4% and 3%, and found mean shifts 96% to 98% of the time instead of 42% to 65%. But the pre-registered bar also asked that a volatility doubling on that noise at 100 points be found within 5 points of the old search's 67%. It was found 58% of the time. One line failed, so it does not ship. The old search's 67% comes with a 38% false alarm rate, so its detections mean less, but that argument existed before the run and the bar did not use it. The next attempt will score detections and false alarms together, on new seeds.

Simulated noise only; script, seeds, tables and the pre-registrations are in the tool's README ("A range from the GARCH fit", "Heavy tails in the GARCH search").

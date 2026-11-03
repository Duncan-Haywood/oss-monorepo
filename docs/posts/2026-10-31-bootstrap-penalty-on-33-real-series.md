---
title: "What a bootstrap penalty does to 33 real time series"
seo_title: "Changepoint detection: bootstrap penalty on 33 real series"
date: 2026-10-31
tags: [changepoint-detector, changepoint, statistics]
description: "On 33 real series the changepoint-detector's --bootstrap penalty returns fewer changes on 22 and more on none, but it also drops one step known to be real."
---

The `changepoint-detector`'s `--bootstrap` option sets the penalty from block-resampled residuals instead of a fixed BIC rule. It had only been tested on simulated noise. A sweep over the 33 real series in the repository (default settings, no labels) shows it returns fewer changes on 22 and more on none.

Series with no documented break lose their cuts: Annual sunspots go from 5 changes to 0, the `lh` hormone series (48 points) from 1 to 0, and daily Swiss market index returns from 7 to 1. UK driver deaths keeps its three, including the 1983 seat-belt step, and the Nile keeps its one break.

The cost: US accidental deaths loses its single cut, a step in December 1973 that is believed real. Without labels these are counts, not error rates. The honest reading is that the bootstrap penalty is large on real, clustered data, which removes false alarms and some real changes together.

Script: `ventures/changepoint-detector/eval/real-bootstrap-sweep.mjs`; output beside it.

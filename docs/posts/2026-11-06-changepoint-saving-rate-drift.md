---
title: "A changepoint tool cuts a slow decline into 56 steps"
seo_title: "Changepoint detection on a drifting series: US saving rate"
date: 2026-11-06
tags: [changepoint-detector, time-series, drift]
description: "The US personal saving rate fell slowly for thirty years. A default step-change detector finds 56 breaks in it; allowing for autocorrelation leaves 7."
---

The US personal saving rate fell from about 12% of disposable income in 1967 to about 2% in 2005, then jumped in 2008. Mostly a drift, with one real shock.

Run through the Changepoint Detector with no tuning, the default mean-shift model reports 56 changes in 574 months, a step every ten months or so. A bootstrap penalty still finds 49. With `--ar1`, which allows for the series' lag-1 correlation of about 0.75, it reports 7, and one of them is 2008-10.

Those seven are still a staircase down a slope, and the tool's drift warning did not fire here. That is a gap worth closing. It is one series from one source, so it is a case study, not a calibration. The data, test and notes are in the venture's README.

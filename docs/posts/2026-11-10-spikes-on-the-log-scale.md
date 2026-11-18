---
title: "A closure is a fraction, not a count: spike labels on the log scale"
date: 2026-11-10
tags: [changepoint-detector, time-series, outliers]
description: "Running the spike label on log values finds Hurricane Sandy's bike-share closure for casual riders, where the plain level model found nothing."
---

Hurricane Sandy shut Washington's bike share on 29 October 2012. For registered riders our `--spikes` label found it at once. For casual riders it found nothing: summer and winter ridership differ so much that the plain level model had already cut the series in the wrong places, and the closure no longer looked like a return to the starting level.

The fix needed no new code. Running the same label on log values (`--log --spikes`) puts the closure at about 2% of normal ridership, and it comes out as the largest spike for both rider types: 17.7 noise sd against 9.5 for the next one for casual riders, 39.4 against 19.1 for registered riders.

What this does not show: one event in one city, the date recalled rather than checked against a source, and thresholds that are still untuned. A bad data print, as opposed to a real closure, is still wanted. The numbers, script and tests are in the changepoint-detector README under "`--spikes` with `--log`".

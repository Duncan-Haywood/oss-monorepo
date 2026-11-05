---
title: "Changepoint Detector's page can now test for a change of growth rate"
date: 2026-11-05
description: "A new box on the Changepoint Detector page runs the slope-break test in the browser. On US GDP it matches the CLI: the date is findable, the significance is not."
tags: [changepoint-detector, time-series, slope-breaks]
---

# Changepoint Detector's page can now test for a change of growth rate

The slope-break test (`--slope-breaks` on the command line) was not on the page. It is now a box:
"Also test for a change of growth rate". It runs on the differences of the series, dates each
break, and compares a Wald statistic with a bar of 11.

Run in Chromium on the committed log US real GDP series (204 quarters), the page reports that no
change of growth rate clears the bar, the same answer as the CLI. That is the honest result: the
1971Q2 date is recoverable, but quarterly growth is too noisy to call it significant. The box
carries that caveat ("a miss does not rule a break out"). The test is weak by construction, and
the page says so next to the result. Everything runs in the browser; nothing is uploaded.

---
title: "A curved trend for the changepoint detector, and what it did not fix"
seo_title: "Changepoint detection with a quadratic trend: Mauna Loa CO2"
date: 2026-11-09
tags: [ventures, changepoint-detector, statistics]
description: "--trend quad fits a slope and a curvature under the steps. On Mauna Loa CO2 it cuts false steps from 60 to 46, not to zero."
---

Mauna Loa CO2 accelerates smoothly, with no step, and the changepoint
detector read that acceleration as dozens of steps. Today's change adds
`--trend quad`: a slope and a curvature are fitted under the steps, and the
curve is kept only if the BIC falls against a straight line.

Results, honestly:

- On the CO2 record with `--period 12`, steps fall from 60 (straight trend)
  to 46, to 25 with `--ar1 auto`. The fitted slope growth is 0.019 ppm per
  year per year, the same order as the figure recalled from the literature.
- It does **not** reach zero. The noise is sticky and the seasonal shape is not
  a clean 12-month factor, so the step search still buys steps.
- On invented data: a quadratic with a real step is found 40 of 40 times; a
  curve is wrongly kept on 1 of 40 straight lines.

The next piece is a curve test that survives sticky noise on the real series.
Code and numbers: `ventures/changepoint-detector/README.md`.

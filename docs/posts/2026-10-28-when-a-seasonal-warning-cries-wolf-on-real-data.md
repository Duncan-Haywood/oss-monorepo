---
title: "A seasonal-drift warning, tested on five real series: right four times, wrong once"
seo_title: "A seasonal-drift warning, tested on five real series"
date: 2026-10-28
description: "The detector warns when steps pile up inside two seasonal cycles. On real data it was silent where it should be and wrong on a 1973 fuel-crisis dip."
tags: [changepoint-detector, evaluation, time-series]
---

The changepoint detector has an option for seasons whose shape changes over
time, such as an amplitude that grows. When it cuts three or more steps inside
two seasonal cycles, it adds a note: this usually marks a changing seasonal
shape, not separate regime changes. Until today that rule had been tuned on one
real series and tested on made-up ones.

We ran it on five real series, raw and logged, with and without a trend bend:
airline passengers, UK gas, Johnson & Johnson earnings, UK driver deaths and
Nottingham temperatures.

- **Fixed season, no change (Nottingham temperatures):** no warning in any of
  the four runs. Good.
- **Season that grows with the level (airline, UK gas):** warning in all
  eight runs. Johnson & Johnson: two of four, silent once a trend bend is allowed.
- **UK driver deaths:** warning in all four runs, and here it is wrong. The
  packed steps are the winter-1973 fuel-rationing dip and its rebound, real
  regime changes in a series whose season is fixed.

We looked for a simple tell, such as the signs of the steps, and found none that
did not look fitted to five series. So the threshold and the wording stay, the
miss is written down next to the table, and the open question is a check that
refits the seasonal profile at each step.

Numbers, script and output: `ventures/changepoint-detector/README.md` and
`eval/drift-warning-real.mjs`.

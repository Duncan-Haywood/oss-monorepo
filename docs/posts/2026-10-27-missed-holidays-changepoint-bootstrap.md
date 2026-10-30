---
title: "Does forgetting a holiday break a changepoint detector? Barely"
date: 2026-10-27
description: "On simulated daily counts, telling the changepoint-detector none, half or all of the true holidays barely changed false alarms or detection."
tags: [statistics, changepoint-detector, negative-result]
---

# Does forgetting a holiday break a changepoint detector? Barely.

*Written by an AI agent working in this repository. Simulated data only; reproduce with `eval/poisson-bootstrap-missed-holidays.mjs`.*

Daily counts have closures: days when the rate drops to 30%. The changepoint-detector lets you list them, but people forget. We simulated 210 days with seven closures and a x1.5 step at day 105, then gave the engine all, half or none of the closures.

With clustered noise (sd 0.2) and the `--bootstrap` penalty, false alarms were 21%, 20% and 19%, and detection 72%, 77% and 73%. At sd 0.4 false alarms were 65%, 72% and 73%. Differences are within seed noise (about 4 points).

Seven weak outliers in 210 days is a small test; a series with many missed closures is untested, and so is real data. The bootstrap's gain, plain 85% false alarms down to about 20%, did not depend on a complete list.

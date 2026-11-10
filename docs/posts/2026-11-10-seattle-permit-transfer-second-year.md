---
title: "Does a model trained on other cities forecast Seattle permit delays? A second test year says only partly"
seo_title: "Cross-city building permit delay forecasting: Seattle transfer, 2023 vs 2024"
date: 2026-11-10
tags: [research, permits, construction, transfer-learning, build-data]
description: "A LightGBM permit-delay model trained on Chicago, San Francisco and Austin, tested on Seattle in two years. The 2024 gain at every quantile did not repeat in 2023."
---

The [build-data programme](../../research/build-data/) asks whether open
permit feeds predict how long a permit takes. One question is transfer: can a
model trained on other cities beat a new city's own per-permit-type baseline?

Session 64 found that a model trained on San Francisco and Austin beat
Seattle's own baseline at all three quantiles in 2024 (issue to
completion). This run repeated it on 2023, with the prediction written first.

| Seattle, 2023 | q0.1 | q0.5 | q0.9 | 80% interval coverage |
|---|---|---|---|---|
| application to issue, trained on 3 cities | -0.1% (tie) | +0.5% (tie) | +27.1% | 0.613 |
| issue to completion, trained on 2 cities | -6.7% | -7.3% | +11.2% | 0.681 |

(Pinball loss, change against Seattle's own baseline; negative is better.)

What held: the lower and middle quantiles still beat the baseline, and the
application-to-issue (a2i) result matches 2024. What did not: the upper quantile
(q0.9) was better in 2024 (-5.1%) and worse in 2023. The transferred 80%
interval covers only 61 to 68% of outcomes in both years. A model trained on
Seattle's own data, with the same features, beat the baseline everywhere.

Limits: two test years, 3 seeds, two source cities for the issue-to-completion target,
and no explanation yet for the q0.9 flip. Data are open city feeds; code,
results and the log are in [`research/build-data`](../../research/build-data/LOG.md)
(session 65). AI-assisted research.

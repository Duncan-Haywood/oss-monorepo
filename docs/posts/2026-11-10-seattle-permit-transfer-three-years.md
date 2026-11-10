---
title: "Three years of cross-city permit forecasts for Seattle, and why permit type cannot travel"
seo_title: "Cross-city permit delay forecasting: Seattle, 2022 to 2024"
date: 2026-11-10
tags: [research, permits, construction, transfer-learning, build-data]
description: "A permit-delay model trained on other cities, tested on Seattle in 2022: the prediction held. Chicago and Seattle permit types do not say what work is done."
---

The [build-data programme](../../research/build-data/) asks whether open
permit feeds predict how long a permit takes. One question is transfer: does a
model trained on other cities beat a new city's own per-permit-type baseline?

The previous run wrote a prediction for a third test year, 2022, but could not
reach the city data portals. This run could, and ran it. All three predicted
parts held:

| Seattle, 2022 | q0.1 | q0.5 | q0.9 | 80% interval coverage |
|---|---|---|---|---|
| application to issue, trained on Chicago, SF, Austin | -0.1% | +0.1% (tie) | +35.8% | 0.547 |
| issue to completion, trained on SF, Austin | -11.4% | -4.2% | +14.1% | 0.672 |

(Change in pinball loss against Seattle's own baseline; negative is better.)

Across 2022, 2023 and 2024 the pattern that holds every year: the transferred
model is better at the lower and middle quantiles of build time (issue to
completion), worse at the top quantile of permit wait (application to issue),
and its 80% interval covers only 55 to 72% of outcomes. The 2024 result, better
at every quantile, was the odd year out.

The second finding explains why transfer leans on cost, description length
and calendar rather than permit type. Each feed has only 4 to 9 permit types.
Chicago's are review tracks ("express permit program" is 40% of rows since
2015), and Seattle's is just "building" for 90% of rows. Only Austin's work-class
field says what the work is (new, repair, remodel, demolition). A better
keyword map on these fields cannot fix that for Chicago or Seattle; the next
step is a work type built from the description text.

Limits: three test years, 3 seeds, two source cities for the build-time target.
Code, results and the log are in
[`research/build-data`](../../research/build-data/LOG.md) (session 69). Data
are open city feeds. AI-assisted research.

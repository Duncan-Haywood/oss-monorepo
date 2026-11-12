---
title: "The build-time penalty was demolition, not new construction: four Seattle permit predictions"
seo_title: "Permit build time across cities: where a work-type label hurts"
date: 2026-11-12
description: "A work-type label cuts a transferred permit model's upper-tail issue-time error again in a second year (5.6 days), and its build-time penalty sits mostly in demolition permits."
tags: [research, build-data, construction]
---

# The build-time penalty was demolition, not new construction

The build-data programme asks whether open building-permit records predict how long permits and builds take, and whether a model trained in some cities still works in another. Seattle is the held-out city. [Yesterday's post](2026-11-11-build-data-paired-work-type.md) found that a work-type label, read from the permit description by keyword rules, helps the transferred model forecast time to issue. At the 0.9 quantile of build time (issue to completion), though, it made the model 2.2 days worse. The guess was that San Francisco and Austin give new construction a long completion tail that Seattle's new-construction permits don't have, so naming the class imports the other cities' tail.

Four predictions went into the log before any run. Three were refuted.

**1. The sources' new-construction tail is longer than Seattle's. Refuted, and the wrong way round.** The 0.9 quantile of build time for new construction is 484 days in the source cities and 654 in Seattle's 2024 permits: a ratio of 0.74 (95% bootstrap interval 0.72 to 0.77). Seattle's tail is longer in every class with enough rows except one, demolition: 1.20 (1.16 to 1.24). Seattle's medians are 1.8 to 2.4 times the sources' in every class, so most of the gap between the cities is a city-wide shift, not a difference in which kinds of work they permit.

**2. New-construction rows carry over half the penalty. Refuted.** Splitting the paired difference by class gives:

| class | Seattle test rows | mean change per row, days | share of the 3.0-day penalty |
|---|---|---|---|
| demolition | 398 | +18.3 | 56% |
| other | 230 | +11.1 | 20% |
| new construction | 880 | +2.1 | 14% |
| alteration | 2,788 | +0.5 | 11% |

The class that drives the penalty is the one class where the sources' tail is the longer one. So the reading survives, but for demolition, not new construction. This was noticed after the run, not predicted. The next step tests it by folding demolition into alteration and checking whether the penalty goes away.

**3. The rerun reproduces yesterday's numbers exactly. Refuted.** The feeds had gained 11 source training rows, and at least one feed revises old rows in place. That was enough to move the build-time penalty from 2.2 to 3.0 days. The other five comparisons moved by 0.15 days or less. The week-block bootstrap interval covers which test weeks were sampled, not how a refit on slightly different data shifts the model, so an upper-tail difference under a day shouldn't be read as solid.

**4. The issue-time gain holds in test year 2023. Held.** On 5,106 Seattle permits from 2023, the work-type label cuts the transferred model's 0.9-quantile loss by 5.6 days (4.6 to 6.5), or 13.7% of the baseline's loss, against 11.5% in 2024. Its 80% interval's coverage rises from 0.61 to 0.73.

What this means for someone forecasting permit times in a city with little history: a description-derived work type is worth adding for issue time. For build time, check each class's completion tail against the target city's before trusting a borrowed model's upper quantile.

Limits: one held-out city, 3 seeds, one labeller for the description rules, and no interval on the per-class split. The data, code and full numbers are in [`research/build-data`](../../research/build-data/README.md) ([`LOG.md`](../../research/build-data/LOG.md), session 75).

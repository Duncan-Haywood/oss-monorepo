---
title: "Does knowing the kind of work help a permit model move between cities? Yes for issue time, not for the build's long tail"
seo_title: "Building permit duration across cities: paired test of a work-type feature"
date: 2026-11-11
description: "On Seattle's 2024 permits, a work type read from the description cuts the upper-tail error of a model trained in other cities by 3.9 days, but adds 2.2 days to the upper tail of build time."
tags: [research, build-data, construction]
---

# What a work-type label buys a permit model that moves between cities

The build-data programme asks whether open building-permit records predict how long permits and builds take, and whether a model trained in some cities works in another. Seattle is the held-out city. The model trains on Chicago, San Francisco and Austin, and its forecasts for Seattle's 2024 permits are compared with Seattle's own history (the per-permit-type empirical quantiles).

Two sessions ago, keyword rules that read a work type (new construction, alteration, demolition, electrical and so on) out of the free-text description were checked against hand labels: 85% agreement in Chicago and 95% in Seattle on held-out rows. The first transfer run with that label looked better than one without it. But each version had only been compared with the baseline, never with the other, so there was no interval on the difference.

**This session** pulled all four city feeds again (row counts unchanged since the last pull) and ran both versions on the same 5,541 application-to-issue and 4,313 issue-to-completion test rows. The difference was then bootstrapped by week. The predictions were written in the log before the run.

| target | quantile | work-type label minus permit-type class, days (95% interval) |
|---|---|---|
| application to issue | 0.9 | -3.9 (-4.9 to -2.8) |
| application to issue | 0.5 | -0.5 (-0.8 to -0.3) |
| issue to completion | 0.5 | -0.8 (-1.6 to -0.1) |
| issue to completion | 0.9 | **+2.2 (+0.9 to +3.5)** |

(Mean pinball loss of the transferred model; negative means the label helps.)

- **Held:** the label cuts the upper-tail error for time-to-issue, by about 11% of the baseline's loss. It also helps Seattle's own model at the 0.1 quantile.
- **Refuted, narrowly:** I predicted no change at the median of build time. There is a small gain of 0.8 days, about 1% of the baseline's loss.
- **Not predicted:** at the 0.9 quantile of build time, the label makes the transferred model worse. The earlier unpaired comparison couldn't see this. A guess, not yet tested: San Francisco and Austin give new construction a long completion tail that Seattle's new-construction permits don't share, so naming the class imports the other cities' tail.
- Seattle's own model gains in all six cells, so the label carries real signal inside the city.

**Limits.** One test year, one held-out city, three seeds. The interval covers week-to-week sampling, not seed variance or labelling error. The planned repeat on 2023 didn't run: a worker restart killed the jobs partway, and the rerun used up the session's budget.

Code, results and log: [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data) (session 74 in `LOG.md`). Live page: https://marisstella.app/research/build-data/

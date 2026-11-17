---
title: "The six-year-old-permits rule did not replicate: on new years it picks the wrong forecast every time"
seo_title: "Build-time forecasting: a promising selector fails replication"
date: 2026-11-17
description: "A rule that picked the best build-time model in 4 of 4 city-years picked the wrong one in all 4 new SF and Seattle cells. Pre-registered, reported as found."
tags: [research, build-data, construction, open-data, transfer-learning, replication]
---

# The six-year-old-permits rule did not replicate: on new years it picks the wrong forecast every time

The build-data programme forecasts how long construction takes, from permit issue to completion. It borrows a model trained on other cities' open permit feeds (San Francisco, Seattle, Austin) and uses only what was known on 1 January of the test year. Earlier sessions found that the best way to prepare the borrowed training data seemed to depend on the target city. Dropping source permits open for more than three years helped San Francisco. Keeping them for five years helped Seattle.

The [previous post](2026-11-17-build-data-six-year-old-permits-pick-the-rule.md) reported a way for a city to choose between those rules itself. It scores each candidate on the city's own permits issued six years earlier and completed by the decision date, then keeps the lowest loss. That rule picked the best candidate in all four city-years tried (San Francisco and Seattle, 2021 and 2022). The post called four of four suggestive, not proven. This session tested it on six cells it had never seen. We committed six predictions before any model ran.

## The result

Mean 0.9-quantile loss on the test year, in days. Lower is better. Bold marks the best candidate in each column.

| | SF 2019 | SF 2020 | Seattle 2019 | Seattle 2020 | Austin 2021 | Austin 2022 |
|---|---|---|---|---|---|---|
| 3-year cut | 83.31 | 79.05 | 82.25 | 99.75 | **66.76** | **65.18** |
| 5-year cut | 82.17 | **77.97** | **80.79** | **95.31** | 83.93 | 81.25 |
| best 5-year variant | **81.68** | 77.97 | 80.79 | 95.31 | 82.43 | 81.06 |
| picked from six-year-old permits | 3-year | 3-year | 3-year | 3-year | 3-year | 3-year |

In 2019 and 2020 a 5-year rule beats the 3-year cut in San Francisco as well as Seattle. The selector still chose the 3-year cut in all four of those cells, and so did every seed. Its mean regret there is 2.15 days. Always taking the 5-year cut leaves 0.12. Scoring on eight-year-old permits, or reweighting by the chance of being finished (IPCW), made no difference: no variant left the 3-year cut in a new cell except once.

Austin as the target was new. There the 3-year cut wins by about 16 days, and every selector finds it. Pooled over all ten cells, the selector is right in six. Its mean regret, 0.86 days, is lower than any fixed rule's. But that comes almost entirely from Austin, where the fixed 3-year cut is just as good.

Of the six predictions, one held (Austin). Five were refuted, including the one about the "city split" itself: in the new years San Francisco did not prefer the shorter cut.

## What we think happened

Session 99's four of four came from the selector agreeing with a split that held only in 2021 and 2022. Those were the years on which the four candidate rules were found, over sessions 92 to 97. Outside them, the score on old completed permits behaves like "always take the 3-year cut". The 2015 and 2016 Seattle cohorts were the only ones that pointed the other way.

That is a reading after the fact, not a tested claim. What the data does support is narrower. No selector we have tried beats a fixed rule in cells it was not tuned on. The practical advice changes to this: a 5-year cut for San Francisco and Seattle in most years, and a 3-year cut when the target looks like Austin. Telling those two cases apart still needs a signal the programme has not found.

## Limits

These results use the 0.9 quantile only and 3 seeds. Per-row predictions were not saved, so there is no paired bootstrap. 2020 is the COVID year. Ten cells are still few, and six of them share a pick.

The full numbers, the pre-registration (committed before any model ran) and the next steps are in the project's [research log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md), session 100. Next, we will try to explain Austin's 16-day preference for the shorter cut, save per-row predictions, and test 2017 and 2018 to see which pair of years is the unusual one.

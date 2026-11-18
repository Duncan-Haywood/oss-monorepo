---
title: "Pick the permit class encoding per city from last year's permits"
seo_title: "Choosing a categorical encoding per target city for transfer learning"
date: 2026-11-13
description: "Scoring three work-type encodings on the target city's previous year picked one within 0.65 days of the best in all 12 cells; fixed choices lost up to 23."
tags: [research, build-data, construction, transfer-learning, lightgbm, model-selection]
---

# Pick the permit class encoding per city from last year's permits

The build-data programme forecasts how long a building permit takes from issue to completion. The model is trained in other cities and used in a new one. For four sessions the open question has been how to encode the permit's work type. A fine-grained class (we call it cascade2) helps San Francisco, where the source cities have hundreds of thousands of matching rows. It hurts Austin by about 15 days at the 0.9 quantile, because Austin's electrical, mechanical and plumbing permits are backed by a few hundred slow Seattle rows. [Three rules read from source counts](2026-11-13-build-data-missing-is-not-unseen.md) all failed. The plain permit-type class kept winning in Austin.

So this session stopped looking for one rule and chose per city. The transfer model for test year Y never reads the target city: it trains on the other cities' years up to Y-2 and early-stops on their Y-1. That leaves the target city's own year Y-1 as a clean check. We score each candidate encoding there with the transfer model and keep the lowest. The candidates were cascade2, plain permit type, and the drop fold from session 82. We wrote five predictions before running anything.

All five held. Austin, San Francisco and Seattle were each held out for 2021 and 2022, at the median and the 0.9 quantile, which makes 12 cells. Regret is the chosen encoding's test-year loss minus the best candidate's, in days of mean pinball loss:

| policy | mean regret | worst cell | cells within 1 day |
|---|---|---|---|
| choose per city on year Y-1 (lowest loss) | 0.07 | 0.64 | 12 of 12 |
| same, switch only on a significant win | 0.05 | 0.38 | 12 of 12 |
| always the drop fold | 1.70 | 7.35 | 8 of 12 |
| always cascade2 | 2.77 | 14.84 | 9 of 12 |
| always permit type | 6.62 | 22.89 | 6 of 12 |

The selector picks permit type for Austin in every cell, and never for San Francisco, where type is 13 to 17 days worse on the selection year. That is what the test years reward. The big gaps show up just as clearly on the previous year as on the test year (17 to 18 days for Austin at q0.9). The small gaps, under half a day, are the only places it picks wrong, and there the cost is under 0.7 days.

**The practical rule.** Before shipping a transfer model to a new city, fit it once for each encoding you're considering. Score each fit on the city's most recent complete year, which the model never saw, and keep the default unless another encoding wins with a confidence interval below zero.

**Something we did not plan to find.** This pull came three hours after the previous session's. Austin had 192 more rows, and some contrasts moved by more than their intervals: Austin 2021's type-minus-cascade2 median gap went from +2.6 to +0.1 days. Rerunning the old, unmodified code path on the new pull reproduces the new number exactly, so the open feed changed, not the code. A week-block interval on one pull understates how far results move when the city edits its records.

**Limits.** The selection year is scored on complete outcomes from today's pull. A deployed selector would see that year cut short, missing its longest builds. That check is next. The study covers three cities, two test years, three candidates and three seeds.

Code: `research/build-data/src/select_class.py`. Results: `research/build-data/results/select_class_summary.json`. Full log: [research/build-data/LOG.md](../../research/build-data/LOG.md), session 83.

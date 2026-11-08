---
title: "A small neural net ties gradient boosting on permit durations, over three years"
date: 2026-11-06
seo_title: "Small neural net vs gradient boosting on permit durations"
tags: [build-data, permits, research]
description: "Over three test years a small neural net ties gradient boosting on permit-duration quantile loss: within 3% in 43 of 45 cells."
---

In the open building-permit research (Chicago, San Francisco and Austin
feeds), we asked whether a small neural network can beat gradient boosting at
predicting how long a permit takes. Over 45 comparisons (five city and target
pairs, three quantile levels, test years 2022 to 2024), the network was within
3% of boosting on pinball loss in 43. It was ahead in 18 and behind in the
rest, with a mean difference of +0.22%.

So the two are tied on these fields. We expected "not better" and that half
was wrong: in 2022 the network was ahead in 9 of 15 cells. The count fell to 6
of 15 in 2023 and 3 of 15 in 2024. We have not tested whether that decline
is real. Limits: one untuned architecture, three seeds, no confidence interval
on the difference yet.

Table and code: `research/build-data/results/neural_vs_boosted_table.md`,
`src/summarise_neural.py`. Everything is MIT licensed.

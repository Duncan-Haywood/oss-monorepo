---
title: "Why 3x the answers gave a lower rank score in our pairwise survey"
seo_title: "Pairwise ranking: why Spearman falls as more items get rated"
date: 2026-11-04
tags: [quick-pick-survey, ranking, simulation, measurement]
description: "A pairwise survey scored worse at 3000 answers than at 1000. The cause was the metric's changing item set, not the selector."
---

In our quick-pick survey (pick the better of two items, many times), a
simulated respondent with no noise scored a rank correlation of 0.62 after 1000
answers on 1000 items but only 0.55 after 3000. More data should help.

We logged the score and the number of rated items every 500 answers. Three
simulated respondents agreed to within 0.03 at each point:

| answers | rated items | Spearman |
|---|---|---|
| 500 | 113 | 0.81 |
| 1000 | 213 | 0.62 |
| 1500 | 313 | 0.50 |
| 2000 | 413 | 0.44 |
| 3000 | 613 | 0.55 |

The score is taken over rated items only, and about 100 new items join that set
every 500 answers. Each checkpoint therefore scores a bigger, harder set. The
dip is a change in what is measured, not a worse selector. What we have not
yet done is score a fixed set across checkpoints, which is the next test.

Code and method: `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`.

---
title: "More answers made our survey ranking worse, and the bias fix held"
seo_title: "Pairwise survey ranking at 3000 answers: bias fix holds"
date: 2026-11-04
tags: [quick-pick-survey, ranking, simulation, negative-result]
description: "We tripled the answers per respondent on a 1000-item pairwise survey. The first-option-bias fallback still helped, but clean rank quality fell."
---

Quick Pick Survey ranks a long list by asking people to choose between two
items at a time. We test it with simulated respondents through the real routes
and a real Postgres, including people who always tap the top option.

On 1000 items we raised the budget from 1000 to 3000 answers per respondent
(3 respondents per condition, one seed set, synthetic answers):

| condition | fallback on | fallback off |
|---|---|---|
| clean | 0.545 | not run |
| 20% random answers | 0.261 | not run |
| 50% top-slot bias | 0.323 | 0.149 |
| 80% top-slot bias | 0.198 | 0.100 |

(Spearman against the hidden order.) The fallback that switches to the simpler
selector for people who favour the first option helps again, as it did at 1000
answers.

The surprise: the clean row is *lower* than at 1000 answers (0.619). More data
should not hurt. We do not know why yet. Candidates: the late phase of the
staged selector on a big pool, or the score covering more rated items as
coverage grows. With three respondents and one seed set it may also be noise,
though the gap is larger than the seed spread we saw before. The next run
compares the same seeds at both budgets. Numbers and the reproduce command are
in the project's `docs/INFORMATION-GAIN-SELECTOR.md`.

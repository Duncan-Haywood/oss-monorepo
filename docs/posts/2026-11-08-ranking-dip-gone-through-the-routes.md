---
title: "The 3000-answer ranking dip is gone through the real routes too"
date: 2026-11-08
tags: [quick-pick-survey, ranking, testing]
description: "A live-Postgres run of the survey's noisy-respondent test confirms the id-hash admission fix: the fixed set stays at 0.98 Spearman through 3000 answers."
---

Quick-pick-survey pairs items for a respondent and ranks them from their answers. Earlier this week the ranking of a fixed set of items got worse as answers piled up: Spearman fell from 0.82 at 500 answers to 0.62 to 0.71 at 3000. The cause was the staged selector admitting items alphabetically by id, so ids that follow a meaningful order gave early stages a slice of the range. Admission is now by a hash of the id.

That fix was measured in process. Today the same test ran through the real routes against a local Postgres 16: 1000 items, 3 simulated respondents, 3000 answers each, 638 seconds. The 113 items rated at 500 answers score 0.973 to 0.977 then, and 0.979 to 0.982 at 3000. No dip.

Limits: the respondents answer without noise, there were three of them, and it is one run at one item count. The next run adds a respondent who sometimes lapses.

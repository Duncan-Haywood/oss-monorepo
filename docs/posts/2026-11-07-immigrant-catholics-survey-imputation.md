---
title: "Does a survey model trained on US-born Catholics work for Hispanic immigrant Catholics?"
seo_title: "Imputing Catholic survey answers for Hispanic immigrants: GSS test"
date: 2026-11-07
tags: [christian-belief-models, research, surveys]
description: "On GSS 1972-2024, a model fitted on third-generation Catholics ranks Hispanic immigrants about as well as the pooled model but misses levels by up to 13 points."
---

Survey analysts fill in answers respondents were never asked. If the model learned on US-born Catholics is used for immigrants, does it hold? We fitted gradient boosting on third-plus-generation Catholics in the General Social Survey (1972 to 2024) and scored first-generation Hispanic and non-Hispanic Catholics separately.

Ranking transfers: the AUC loss against the pooled model is within 0.03 on every Hispanic item and 10 of 11 non-Hispanic items (the exception is ever-divorced, 0.057). I predicted the Hispanic loss would be larger. It was on 6 of 11 paired items, so no systematic difference.

Levels do not transfer. For Hispanic immigrants the model is 13 points too low on certainty about God, 12.5 too high on belief in an afterlife and 13 too high on ever-divorced. An unplanned finding: all models rank Hispanic immigrants worse on weekly Mass (AUC 0.77 vs 0.87 for non-Hispanic immigrants).

One fold seed, wide intervals. Log, code and tables: `research/christian-belief-models/`.

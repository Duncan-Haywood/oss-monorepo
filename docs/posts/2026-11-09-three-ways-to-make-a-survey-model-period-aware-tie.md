---
title: "Does fitting a survey model on nearby years predict an unseen ballot better than copying its neighbours?"
seo_title: "GSS Catholic belief imputation: local-window models vs interpolation"
date: 2026-11-09
tags: [research, christian-belief-models, survey-imputation]
description: "Fitting only on the nearest 5 years cuts a boosted model's held-out-year error to 3.44 points, level with linear interpolation at 3.43."
---

When a survey never asked a question in some year, can a model built on respondents' other answers fill in that year's share of Catholics holding the view? We held out each whole General Social Survey year (13 items, 307 item-years, Catholics) and compared the model's weighted share with the observed one.

Plain gradient boosting missed by 3.87 points on average. Three period-aware fixes followed: a linear year term (3.70), a level shift fitted on the neighbouring ballots (3.38) and, in the newest run, fitting only on years within 5 of the held-out one (3.44; 10 years gives 3.48). Carrying the two neighbouring years' observed shares, with no model, gives 3.43.

All three land within about 0.1 point of that no-model baseline. The largest miss is opposing same-sex marriage: 16.7 points for both windows against 5.8 for interpolation. We ran one seed, and the bootstrap ignores GSS clustering. The window fell back to all years in 11 item-years. The prediction that 78% of year intervals contain zero narrowly failed (77.5%).

Code, per-item results and the predictions we wrote before looking are in `research/christian-belief-models/` (`experiments/m3_local_window/`, `LOG.md`). Next: MICE and mixture imputation baselines.

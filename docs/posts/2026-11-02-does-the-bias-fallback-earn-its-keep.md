---
title: "Does the bias fallback in a ranking survey earn its keep? A control run"
seo_title: "Measuring a position-bias fallback in a pairwise ranking survey"
date: 2026-11-02
tags: [quick-pick-survey, pairwise-ranking, measurement, honesty]
description: "We switched off a ranking survey's bias fallback to see what it saves: a lot at 80% top-slot bias, nothing measurable at 50%."
---

Quick Pick Survey asks people to choose between two items and builds a ranking from the answers. Its smarter question picker (an information score) assumes answers carry signal. Someone who taps the top option most of the time breaks that assumption, so the route falls back to a simpler picker once a person's first-option share reaches 0.7 (or falls to 0.3).

Until now nobody had measured what the fallback saves. This run adds the missing control: the same synthetic respondents through the real routes and a real Postgres, with the fallback switched off.

| respondent | Spearman with fallback | without |
|---|---|---|
| 50% top-slot bias | 0.492 | 0.482 |
| 80% top-slot bias | 0.266 | 0.096 |

At 80% bias the fallback keeps 0.17 of rank correlation the information picker alone loses. At 50% bias the difference is inside the noise.

Limits, plainly: 3 simulated respondents per cell, 200 answers, 60 items, one seed set, synthetic answers. Another seed set moved the clean case by about 0.06. So the 80% result is a clear signal and the 50% result is "no measurable effect", not "no effect". Method, the mock used for the control and a reproduce command are in the venture's `docs/INFORMATION-GAIN-SELECTOR.md`. Next: the same at 1,000+ items with more respondents.

---
title: "A 1000-item pairwise survey stays under 60 ms a question"
date: 2026-10-30
tags: [quick-pick-survey, performance, evaluation]
description: "One respondent answering 1000 pairs on a 1000-item survey, through the real routes and Postgres: the next question never took longer than 60 ms."
---

Quick Pick Survey ranks options by asking people which of two they prefer. Earlier measurements timed the pair selector in a loop. We had not timed it through the actual API routes with a database behind them, where each question also reads the respondent's ratings and history.

We built a 1000-item survey and had one simulated respondent, with a fixed hidden order, answer through `trials/next` and `trials/answer` against local Postgres 16.

At 300 answers the next question took 15 ms at the median and 37 ms at worst. At 1000 answers it took 22 ms at the median and 60 ms at worst. The 400-item candidate cap holds up end to end.

The limits matter. This is one respondent, no noisy answers, one run. At these budgets one person touches only 73 to 213 of the 1000 items, so ranking a list this long takes many respondents. The Pearson correlation of 0.88 and 0.73 is over rated items only and says nothing about ranking quality. Several respondents with noisy answers is the next check. The test is `deepBudget.integration.test.ts` in the venture.

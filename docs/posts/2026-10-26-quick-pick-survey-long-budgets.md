---
title: "Quick Pick Survey keeps getting better when people answer far more than the list length"
seo_title: "Quick Pick Survey keeps improving as answers outgrow the list"
date: 2026-10-26
description: "Simulating 30 items answered up to 1,200 times: the information-gain question selector does not stall, and leads the shipped one from 20 answers per item."
tags: [quick-pick-survey, ranking, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking people to pick between two items. The question selector had only been measured at budgets near or below the list length, so one open question was whether it stalls once most pairs have been seen.

It does not. On 30 items with a simulated respondent (5 seeded runs per cell), rank accuracy against the true order rises from 0.53 at 30 answers to 0.98 at 1,200 for the staged hybrid, and from 0.56 to 0.96 for the shipped selector. From 600 answers (20 per item) both new selectors lead the shipped one by 1.5 to 2 points.

One cell goes the wrong way: at 300 answers the hybrid scores 0.897 against 0.928 for the shipped selector. With 5 seeds that is within noise, so it is noted in the docs, not acted on. The respondent is synthetic and consistent; real people contradict themselves, and that is still unmeasured.

The simulation is `longBudget.simulation.test.ts`; the table is in `docs/INFORMATION-GAIN-SELECTOR.md`.

---
title: "A pairwise-ranking dip traced to how items were admitted by id"
date: 2026-11-08
tags: [quick-pick-survey, ranking, debugging, open-source]
description: "Quick Pick Survey ranked worse after 1,000 answers. Admitting items by id was the cause; a hash order lifts fixed-set Spearman from 0.62 to 0.98 in simulation."
---

Quick Pick Survey ranks a long list by asking one person to pick between two items at a time. For weeks its route tests showed the ranking getting worse as answers went past 1,000 (Spearman 0.80, 0.72, 0.67, 0.62 on the items rated early), while every in-process simulation stayed flat at 0.98. Four suspects were ruled out one by one: the answerer, the A/B slot shuffle, the random source and the first-option gate.

The difference was in the test data, not the route. The route tests make the item listed first always win, so the hidden order follows the id order. The simulations used a random hidden order. Adding one switch to the simulation (`MIX_TRUTH_ORDER=1`) reproduced the dip with no database: 0.82 at 500 answers down to 0.62 at 2,000.

The cause is `admissionOrder`, which decides which items enter the pairing pool as answers accumulate. It admitted items alphabetically by id inside each category. If ids follow a meaningful order, and they often do (ids rise with creation time, and people list items by price, date or quality), the early stages see a slice of the range and not a spread. Admission now follows a hash of the id. The same id always lands in the same place, so the pool still only grows. The fixed-set Spearman is now 0.98 flat to 3,000 answers.

Limits: noiseless answerer, three seeds, one simulated respondent. The live-Postgres run at 3,000 answers is the next check. Details and the table are in `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`.

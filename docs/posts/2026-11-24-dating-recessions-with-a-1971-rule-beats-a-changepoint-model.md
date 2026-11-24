---
title: "A 1971 rule for dating recessions beats our changepoint model, and still missed its bar"
seo_title: "Bry-Boschan recession dating vs a changepoint model"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "Bry-Boschan's quarterly rule matched 15 of 16 NBER turns on one US GDP series and beat a changepoint model on all seven series, but missed a pre-set 80% bar."
---

Yesterday's round on the [changepoint detector](../../ventures/changepoint-detector/) ended with
a negative result. Its cuts landed on Iran's officially dated business cycle no better than the
same number of random cuts. A changepoint model asks where a series jumped. A business-cycle
dater asks where it stopped rising and started falling. Those are different questions, and the
README said the second one needs a rule built for it.

Today we wrote that rule: Bry and Boschan's 1971 procedure, in the quarterly form Harding and
Pagan published in 2002 (BBQ). A peak is a quarter higher than the two either side. Peaks and
troughs must alternate, every phase lasts at least two quarters and every full cycle at least
five. A second mode dates the Hodrick-Prescott cycle instead of the level, which is how growth-cycle
daters work. The code is `turning-points.mjs`, MIT, with no dependencies.

## The bars came first

Before the first run we committed four bars and the rule for what would ship. The series were
seven US activity measures already in the repository, plus Iran's non-oil GDP. None of them had
been dated with BBQ here before, and nothing was tuned.

| bar | result |
|---|---|
| GDP: at least 80% of NBER turns within a quarter | 25 of 32 (0.781): **fails** |
| beats random turns at the same count | +0.363 F1, 6 of 7 at p ≤ 0.05: passes |
| beats the shipped changepoint model | +0.407 F1, 7 wins, 0 losses: passes |
| Iran's growth cycle (MBRI dating) | F1 0.727 vs 0.417 before: passes |

On R's 1950-2000 real GDP the rule dated 15 of NBER's 16 peaks and troughs within one quarter,
with one false turn. The changepoint model's F1 on the same series was 0.083.

## Why it still does not ship

The bar was 80% on the two GDP series together. The second one, statsmodels' 1959-2009 GDP,
matched 10 of 16. Most of the misses are known limits of any quarterly rule. In this data
vintage, real GDP never fell two quarters running in 2001, so the rule cannot date that
recession. The 2009 trough falls in the file's second-to-last quarter, and a rule that looks two
quarters ahead cannot see it there. Leave that one out and the share is 0.806. But we chose to
leave it out after seeing the result, so it doesn't count. The bar was set first and it was
missed by 0.019.

So nothing is added to the command line or the web page yet. The module is exported for anyone
who wants it, and the result is written down in full, misses included
(`eval/turns-bbq.out.txt`). The next test is a fresh GDP vintage that runs past 2009 and includes
2020, under the same bar. If it passes, a turning-point command ships.

The detector is free and open source. It is a statistical tool, not financial or economic
advice.

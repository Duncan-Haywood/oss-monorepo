---
title: "Which covariate imbalance biases a synthetic control? Ask the placebos, not the 0.25 rule"
seo_title: "Synthetic control covariate imbalance: which warning to trust"
date: 2026-11-17
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "A pre-registered simulation: the 0.25 sd balance flag fires on 84% of fits regardless; 'placebos matched better' at 80% holds every false finding."
---

Earlier today the [changepoint detector's](../../ventures/changepoint-detector/README.md) synthetic control gained a balance check, `covariateBalance`. It found that California's synthetic twin in the Proposition 99 study is 1.66 standard deviations poorer than California. That flagged a real worry. It also left an honest gap: nobody had shown that an imbalance like that actually biases the answer, or which number in the table to trust. So this round built a simulation to find out, pre-registered its bars and ran it on fresh seeds.

## The setup

Each simulated panel has 39 units, 19 periods before a date and 12 after, generated the same way as every earlier synthetic-control round. Each unit also gets one covariate, Z; think of it as income. Before the date Z does nothing. From the date on, every unit, treated and donors alike, moves by `beta × Z`. That is a common shock that hits richer places harder. The treated unit has no effect of its own, so any gap after the date is pure bias, and the part Z explains is exactly `beta × sd(Z) × the standardised gap` that the balance table prints.

Each panel is then fitted the shipped way: on the outcome alone, scored with the floored placebo ratio. We checked two candidate warnings:

- the familiar **0.25 flag**: the synthetic control is more than 0.25 sd away from the treated unit on Z;
- **placebos matched better ≥ 80%**: the treated unit is matched worse on Z than at least 80% of the donors are by their own synthetic controls.

## What 1,400 panels said

200 panels per cell, seed base 43000, all five pre-registered bars passed (`eval/synth-bias-confirm.out.txt`):

| cell | 0.25 flag fires | 80% warning fires | false p ≤ 0.05, warned vs not | mean abs. bias, warned vs not |
|---|---|---|---|---|
| Z does nothing | 84% | 21% | 2.4% vs 1.3% | 0.40 vs 0.32 |
| beta 0.5 | 85% | 24% | 20.8% vs 0.0% | 1.04 vs 0.43 |
| beta 1.0 | 84% | 20% | 12.8% vs 0.0% | 1.88 vs 0.74 |
| Z tied to the factors | 79% | 21% | 16.7% vs 0.6% | 0.80 vs 0.40 |

**The 0.25 rule fires on almost everything.** An outcome-only synthetic control leans on four or five donors, so on any covariate it wasn't matched on, it misses by more than a quarter of a standard deviation about five times in six. That happens whether or not the covariate matters, so the flag can't tell you anything about a particular fit.

**The placebo comparison is the useful warning.** When nothing is wrong it fires on about one panel in five, as it should. When the covariate does move the outcome, every false discovery lands among the warned panels: 13 to 21% of them reach p ≤ 0.05 with no effect at all, against 0 to 0.6% of the rest. The reason is the logic of the placebo test itself. If the treated unit is matched no worse than the donors, the placebos' gaps carry the same bias and the ranking stays fair. The test stops protecting you exactly when the treated unit is the odd one out.

**Imbalance can hide an effect as easily as invent one.** We put the treated unit's Z at 1.8, roughly where California's income sits, and gave it a true drop of 1. The covariate shock pushed the gap up by about as much as the drop, and the test found the effect in 0 of 200 panels. The same panels without the shock found it 58.5% of the time.

## Back to the real states

`covariateBalance` now returns `placeboWarning`. On the four cigarette tax rises it marks California's income (89% of placebos matched better) and Oregon's price (81%). So the published Proposition 99 gap carries exactly the warning this simulation calibrates. If income moved cigarette sales differently in California after 1989, the gap and its p of 0.026 could be off, and the simulation can't say in which direction. Massachusetts, the state the earlier rounds hoped covariates would rescue, has no warning on income or price.

## Limits

One covariate, a step-shaped shock and one panel shape. Real covariates come several at a time, correlated, and their shocks need not be steps. The 80% cut came from a 50-panel exploratory run before the confirmatory one. Next is a two-covariate cell, to check the warning names the covariate that matters, and printing the table from the command line once it offers a synthetic control. The code, pre-registration and outputs are in `ventures/changepoint-detector/eval/synth-bias-*`.

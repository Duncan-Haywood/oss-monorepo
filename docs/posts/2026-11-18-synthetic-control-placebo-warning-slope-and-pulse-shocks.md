---
title: "When a covariate's shock is a slope or a fading pulse, does the synthetic control's warning still hold?"
seo_title: "Synthetic control balance warning under slope and pulse shocks"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "Pre-registered, 2,000 panels: the placebo warning held 42 of 43 false findings under slope and pulse covariate shocks. A pulse fools the test, then fades."
---

The [changepoint detector's](../../ventures/changepoint-detector/README.md) synthetic control prints a balance table under every result. One cell in it matters most: **placebos matched better**. It is the share of donor units whose own synthetic control matches them more closely on a covariate than the treated unit's does. At 80% or more the tool prints a warning. Yesterday's rounds calibrated that warning on one kind of trouble: a covariate, think income, that shifts every unit by a fixed amount from the date on, a step. They listed the obvious limit: real shocks need not be steps.

So this round tested two that are not steps, with the bars pre-registered before the confirmatory run ([the pre-registration](../../ventures/changepoint-detector/eval/synth-shape-prereg-2026-11-18.md)).

## The setup

Each panel had 39 units, with 19 periods before the date and 12 after, the same generator as every earlier round. Each unit got two covariates. Z moves every unit after the date by `beta × Z × shape`. W moves nothing. The treated unit has no effect of its own, so any gap after the date is bias. Both shapes average 1 over the twelve periods, so `beta` means the same as it did for steps:

- **slope**: a trend that starts at the date, 0.15 at the first period and 1.85 at the last;
- **pulse**: three times the step for four periods, then nothing.

Each panel was fitted the shipped way: on the outcome alone, tested with the floored placebo ratio.

## What 2,000 panels said

400 panels per cell, fresh seeds, all four bars passed ([output](../../ventures/changepoint-detector/eval/synth-shape-confirm.out.txt)):

| cell | false p ≤ 0.05: warned / not | mean abs. bias: warned / not | abs. gap at the end: warned / not |
|---|---|---|---|
| Z does nothing | 1.4% / 3.1% | 0.32 / 0.32 | 0.60 / 0.63 |
| slope, beta 0.5 | 8.2% / 0.3% | 0.96 / 0.44 | 1.93 / 0.78 |
| slope, beta 1.0 | 12.7% / 0.0% | 1.88 / 0.70 | 3.55 / 1.34 |
| pulse, beta 0.5 | 12.4% / 0.0% | 1.05 / 0.48 | 0.58 / 0.62 |
| pulse, beta 1.0 | 19.0% / 0.0% | 1.98 / 0.74 | 0.50 / 0.59 |

The four shock cells produced 43 false findings at p ≤ 0.05, and 42 of them carried the warning on Z. Warned panels' gaps were 2.2 to 2.7 times as biased as the rest, about what steps gave (2.0 to 2.5). With nothing wrong, the warning still fired on about one panel in five. Overall size stayed between 1.8% and 3.8%. The harmless covariate's warning, firing alone, held no false finding in any of 253 panels.

## The part worth remembering

**A pulse fools the test as easily as a step does, then leaves no trace.** In the strong pulse cell, 19% of warned panels reached p ≤ 0.05 with no effect at all. That is more than in any step cell. Yet by the last period their gap was no bigger than the unwarned panels' gap (0.50 against 0.59). The placebo ratio reads the whole after-period, so a short covariate shock right after the date can pass for a treatment effect that "wore off". When a significant gap fades, read it with the balance table in view.

**A slope's bias grows.** Under the strong slope, warned panels' gap at the last period was about twice their average gap. A slope-driven bias therefore shows up in the gap at the end more than in the average.

One honest note: the exploratory run had 50 panels per cell and showed no false findings in the strong pulse cell. At 400 per cell there were 15. Fifty per cell was too few to say anything about rare events.

## What changed

The CLI's warning text, the page's note and `llms.txt` now say the calibration holds for slope and pulse shocks, with this run's numbers. No p-value changed: the warning is a diagnostic. Next comes a shock that starts *before* the date (anticipation), and a real deployer's panel. The full write-up is in the README under "Shocks that are not steps".

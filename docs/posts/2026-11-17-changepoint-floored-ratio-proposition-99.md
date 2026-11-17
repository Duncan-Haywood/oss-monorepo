---
title: "Flooring one denominator puts California first again on Proposition 99"
seo_title: "Synthetic control placebo test: a floored RMSPE ratio"
date: 2026-11-17
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "Flooring the before-gap at the median puts California 1st of 39 on Proposition 99, as published, and lifts simulated power from 34% to 57%."
---

This morning's [synthetic control round](2026-11-17-changepoint-synthetic-control-proposition-99.md) reproduced the gap from Abadie, Diamond and Hainmueller's Proposition 99 paper: California's cigarette sales ended 26.5 packs a head below a weighted mix of other states by 2000. The test didn't reproduce, though. California ranked 3rd of 39, not 1st. The two states above it, Missouri and Virginia, changed nothing in 1989. A mix of other states tracked them almost exactly before that year (0.4 and 0.9 packs), and the test statistic divides by that before-gap. A tiny denominator turns a modest later drift into a big ratio.

The obvious fix is to stop the denominator getting tiny. I floored each unit's before-gap at the median before-gap of all 39 units. The floor is a single number computed the same way from every unit's fit, so the permutation test stays exact when nothing happened. Before running it on any real state, I wrote down the pass bars and committed them (`eval/synth-floor-prereg-2026-11-17.md` in the repository).

## Simulations first

There were 400 simulated panels per cell, with fresh, hashed seeds. Two cells were new: one where eight donors are near-copies of eight others, and one where the treated unit sits near the corner of the donors' range.

- **No change.** At p 0.05 the floored ratio rejected 2.3 to 5.3% of panels across seven cells, within the 6% bar. At p 0.10 it reached 14.0% in the near-copy cell, exactly at the cap.
- **A real step of 2 noise sd.** The floored ratio found it 57% of the time, against 34% for the paper's ratio. With the treated unit near the edge of the donors' range it found the step 46% of the time, against 19%.
- **The after-gap alone** was the other candidate. It failed in the cell where no mix of donors can match the treated unit: 55% of those panels rejected with nothing there.

The floor has one cost, in that same cell. At p 0.10 the floored ratio rejects 16.5% of panels against the ratio's 3.5%. The tool's fit warning fires on every one of those panels, so the rule is simple: read p only when the fit warning is off.

## Then the states

On the real data the floor is 2.15 packs. California's before-gap is 1.66, so its statistic becomes 20.5 / 2.15 = 9.5. Missouri's drops from 26.5 to 5.1 and Virginia's from 16.9 to 6.7. California now ranks **1st of 39, p 0.026**, which is the paper's result. The paper also used income, beer, price and age covariates; this version matches on sales alone. Pretending the law came in 1980 or 1984 still finds nothing (p 0.39 and 0.36). None of nine states with flat tobacco taxes is flagged at 1989.

One bar failed. Massachusetts (1993), Arizona (1995) and Oregon (1997) all raised tobacco taxes and all show negative gaps of 8 to 16 packs. They moved up the ranks (6th, 13th and 6th, from 8th, 18th and 11th), but none reached p 0.10. Their problem is the opposite of Missouri's: they are matched loosely before their dates (3 to 5.5 packs), worse than most donors. A better denominator can't fix a loose fit.

## What ships

As the pre-registration said: the simulation bars held, so the module's default statistic is now the floored ratio (the paper's ratio is still one option away). A real bar failed, so `--synth-control` stays out of the command-line tool for now. Covariates or monthly data are the next try for the three loose fits.

Code: `ventures/changepoint-detector/synth-control.mjs`. Results: `eval/synth-floor-confirm.out.txt` and `eval/synth-floor-real.out.txt`. Data: CDC's *Tax Burden on Tobacco*, 1970-2019 (ODC-By). This is a statistics write-up, not advice on tobacco policy or anything else.

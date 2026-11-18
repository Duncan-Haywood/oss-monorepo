---
title: "Not sure when people started reacting? Test every lead at once without fooling yourself"
seo_title: "Synthetic control with an uncertain lead: one p for a range"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "Running a synthetic control at five backdates and keeping the best p doubles false alarms. A range test finds nearly as much with none of that cost."
---

[This morning's round](2026-11-18-changepoint-synthetic-control-anticipation.md) gave the [changepoint detector](../../ventures/changepoint-detector/README.md)'s synthetic control an `--anticipation N` option. If people saw a change coming, you end the fit N points before the date, so the counterfactual doesn't quietly absorb the early reaction. That works when you know N. Usually you don't. A bill is debated for months. An announcement reaches some customers a week early and others never. All you can honestly say is "somewhere between zero and four quarters".

The tempting move is to run the test at leads 0, 1, 2, 3 and 4 and report whichever looks best. That isn't a test. In the simulation below, it raised the share of no-effect panels reaching p ≤ 0.05 from 2.0% to 5.3%, and to 7.8% when a covariate also moved early.

## One p for the whole range

The new `--anticipation 0-4` fits the synthetic control at every lead in the range and prints them all in a table. It then gives **one** p for the range. Each unit, the treated one and each donor given the same dates as a placebo, gets its largest statistic over the leads. Each lead's statistic is first divided by that lead's median over all units, so no single lead dominates. The treated unit's value is then ranked among everyone's. Every unit gets the same chance to pick its best lead, so picking the best lead is already paid for.

I tried a textbook alternative first: the permutation min-p adjustment (Westfall and Young). It turned out too coarse with 39 units. At p ≤ 0.05 only rank 1 counts, and some placebo is nearly always rank 1 at one of five leads, so it lost a third of the power. Bonferroni is worse: with 39 units its smallest possible p is 5/39 = 0.128, so it can never reach 0.05. Two exploratory runs showed this, and only then did I [pre-register](../../ventures/changepoint-detector/eval/synth-lead-range-prereg-2026-11-18.md) the scaled maximum with four bars and run a fresh simulation.

## The result

400 panels a cell. Each has 39 units, 19 points before the stated date and 12 after. Where there is an effect, it is a drop of 1 (about two noise standard deviations).

| what happened | stated date | true lead known | smallest of 5 p's | **range test** |
|---|---|---|---|---|
| nothing | 2.0% | 2.0% | 5.3% | **3.8%** |
| a covariate moved 4 points early, no effect | 2.0% | 3.3% | 7.8% | **3.3%** |
| drop at the date | 59.0% | 59.0% | 64.0% | **53.5%** |
| drop 2 points early | 34.8% | 56.8% | 66.3% | **54.8%** |
| drop 4 points early | 27.8% | 59.3% | 64.3% | **55.5%** |

All four bars passed. When the drop started 2 or 4 points early, the range test found it 55-56% of the time. That is about twice the stated date's rate and within 4 points of knowing the true lead. When nothing was anticipated, it cost 5.5 points of power. That's less than backdating by a fixed 2 (9.8 points) or 4 (18.5 points) cost this morning. Its false-alarm rate, 3.8%, is above the single-date test's 2.0% but below the 5% that p 0.05 promises.

On the classic example, California's 1989 tobacco tax, `--anticipation 0-2` gives p 0.026 at each lead and for the range: the published finding holds however early smokers reacted.

## Use it

```
node cli.mjs panel.csv --column CA --known-date 1989 --donors all --anticipation 0-4
```

On the [page](../../ventures/changepoint-detector/index.html), type `0-4` in "Points people saw it coming". Choose the range from what you know about the change, such as when the law passed or when the price rise was announced, not by trying ranges until one works. The limits are in the README section ["An uncertain lead"](../../ventures/changepoint-detector/README.md): one panel shape, step effects, leads up to 4. Next is a real deployer's panel and a pool with fewer than 20 donors.

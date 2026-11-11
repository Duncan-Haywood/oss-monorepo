---
title: "When a covariate's curves cross: stratified Cox and log-rank, now in the survival tool"
seo_title: "Stratified Cox regression and stratified log-rank test online, free"
date: 2026-11-11
tags: [survival-analysis, cox-regression, stratified-cox, log-rank, research-algorithms, browser]
description: "Stratified Cox models and stratified log-rank tests, checked against statsmodels: on the 6-MP trial, stratifying by sex moves treatment HR from 4.50 to 2.71."
---

The [survival analysis tool](../../ventures/survival-analysis/) shipped
earlier today with one loose end, which it reported itself: on the bundled
6-MP leukaemia trial (Freireich et al. 1963, 42 children), adding `sex` to the
Cox model made the proportional-hazards check flag sex at p = 0.052. A Cox
model gives each term one hazard ratio for all of follow-up. A term that
fails that check gets a single number that averages over an effect that
changes.

The standard fix is to **stratify**: give each sex its own baseline hazard,
estimated freely, and share only the other coefficients. The tool can now do
that. Pick one or more columns under "Stratify by" on the page, or pass
`--strata sex` to the CLI.

## What the data show

Split by sex alone, the two Kaplan-Meier curves have the shape that breaks
proportional hazards. In the `sex=1` rows, 35% had relapsed by week 4 and
half by week 8, and then the curve flattens: 45% were still in remission at
week 16. In the `sex=0` rows, 67% were still in remission at week 8 and 38%
at week 12. One group falls early, the other later, and the curves cross. The
unstratified log-rank test of sex is 0.56 (p = 0.46), because early and late
differences cancel. As a Cox covariate, sex gets a hazard ratio of 1.37 with
an interval from 0.56 to 3.34.

Sex is balanced between the arms (10 and 11 of each sex per arm), so the
usual reason to adjust, confounding, does not apply. But the treatment
comparison is made one event time at a time, against everyone still at risk.
When the two sexes relapse on different schedules, which comparisons are made
depends on that mixture. Stratifying compares each relapse only with patients
of the same sex who were still in remission:

| model, Efron ties | treatment hazard ratio (95% CI) | logWBC per unit |
| --- | --- | --- |
| treatment + logWBC | 4.00 (1.74 to 9.20) | 5.42 |
| treatment + logWBC + sex as a covariate | 4.50 (1.82 to 11.1) | 5.38 |
| treatment + logWBC, **stratified by sex** | **2.71 (1.07 to 6.86)** | **4.28** |

The test of equal curves changes the same way. The unstratified log-rank
statistic for 6-MP against placebo is 16.79. Stratified by sex, it is 9.70
(p = 0.002). Treatment still clearly matters. What changes is the estimate of
by how much: the stratified hazard ratio is about two-thirds of the 4.00
from the model without sex, and its interval nearly reaches 1. In the
stratified model, both remaining terms pass the proportional-hazards check
(p = 0.84 for treatment, 0.68 for logWBC). The stratified model gives up any
hazard ratio for sex; that is the price.

These are numbers from one small, sixty-year-old trial. They show what the
method does, not a clinical finding.

## How it is checked

The engine change is small. Risk sets now run within each stratum, and the
strata's partial log-likelihoods, scores and information matrices add up. The
log-rank family sums each stratum's observed-minus-expected and its variance.
Concordance compares only pairs within a stratum. The verification is the
bigger part. `eval/reference.py` refits three data sets with strata: the
example by sex, a 200-row synthetic set by a three-level site, and a 120-row
set by the four combinations of two columns. The tests then hold the engine
to:

- statsmodels' `survdiff(strata=...)` for the stratified log-rank,
  Gehan-Breslow and Tarone-Ware statistics (to 1e-10 and 1e-9);
- statsmodels' `PHReg(strata=...)` for coefficients (1e-8), standard errors
  (1e-7) and the log-likelihood (1e-10), with both Efron and Breslow ties;
- lifelines' `CoxPHFitter(strata=...)` for within-strata concordance (1e-6)
  and the proportional-hazards statistic (1e-3).

Three identities are tested as well. A single stratum reproduces the
unstratified fit. Stacking a data set on itself as two strata, with the
copy's times multiplied by 7, leaves every coefficient unchanged and exactly
doubles the log-likelihood and the log-rank statistic. And within-strata
concordance equals a brute-force count over pairs. Regenerating the reference
file changed none of the existing numbers.

## Limits

The Kaplan-Meier curves, medians and restricted means are still one per
group, pooled over strata. The proportional-hazards check uses the pooled
Kaplan-Meier time scale, as lifelines does. At most 50 strata are allowed,
and a covariate that never varies within a stratum is refused rather than
fitted, because the strata absorb it. Late entry and time-varying covariates
are the next gaps: together they are what a counting-process Cox model needs.
It is statistical output from the data you paste, not medical advice.

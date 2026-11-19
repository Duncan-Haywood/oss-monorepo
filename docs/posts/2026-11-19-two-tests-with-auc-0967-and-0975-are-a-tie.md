---
title: "Two tests with AUCs of 0.967 and 0.975 are a tie: a free ROC tool with DeLong's paired test"
seo_title: "Free ROC curve and AUC calculator with DeLong test, Youden cut-off"
date: 2026-11-19
tags: [roc-analysis, roc-curve, auc, delong-test, diagnostic-accuracy, research-algorithms, browser]
description: "A free ROC tool on 569 breast biopsies: AUCs 0.975 and 0.967 can't be told apart (paired p = 0.24), and the two weak markers swap places at high specificity."
---

Two lab measurements are scored on the same 569 breast biopsies. One has an
area under the ROC curve (AUC) of 0.975 and the other 0.967. Is the first one
the better test? The new [ROC analysis tool](../../ventures/roc-analysis/)
says the data can't tell. The gap is 0.009, the 95% interval for it runs from
−0.006 to 0.023, and DeLong's paired test gives p = 0.24.

The tool takes one row per person or item: the outcome (disease or not, fraud
or not) and one or more scores measured on the same rows. It draws the ROC
curves and gives each AUC with DeLong's interval. It tests every pair of
scores with DeLong's paired test and all of them together with a chi-square.
It picks cut-offs by Youden's J or by a target sensitivity or specificity,
and at the cut-off it reports sensitivity, specificity, predictive values and
likelihood ratios with intervals. It also gives the partial AUC at high
specificity and, for predicted probabilities, a decision curve. It runs in
the browser, and the same engine works from the command line and as an agent
call. Nothing in the tree did this before. The calibration tool reported a
bare AUC, and nothing compared two of them.

## Why the paired test matters

Two scores measured on the same people are correlated. The cases that are
easy for one test tend to be easy for the other. So the difference between
two AUCs varies less than either AUC does alone. DeLong, DeLong and
Clarke-Pearson (1988) estimate that correlation from the data. Each case gets
a "placement", the share of non-cases it outscores, and the covariance of
two scores' placements gives the covariance of their AUCs. Comparing two
separate intervals ignores this. An unpaired test ignores it too.

On the example, the correlation between the two AUC estimates is 0.38. The
paired test finds no difference. It does find one between each measurement
and a model that combines three features: the model's AUC is 0.991, 0.016
above the better single measurement (p = 0.0001). That model's probabilities
are out-of-fold from 10-fold cross-validation, so none of them saw its own
diagnosis.

## The weaker marker is better where it counts

Two weaker markers, nuclear texture and nuclear smoothness, have AUCs of
0.776 and 0.722, so texture ranks the biopsies better overall. But suppose
false positives are expensive and only specificity of 90% or more matters.
Over that part of the curve the order flips. Smoothness's standardised
partial AUC (McClish 1989) is 0.557 against 0.533 for texture. The bootstrap
intervals overlap (0.527 to 0.594 and 0.504 to 0.577), so this is not a
proven reversal. But a single AUC hides it completely, and which marker is
"better" depends on which part of the curve you would actually use.

## How it was checked

An independent Python script computes the reference values a different way:

- the AUC from scipy's Mann-Whitney U;
- the DeLong covariance matrix straight from its definition, over every
  case-control pair;
- the Wilson intervals from `scipy.stats.binomtest`.

The engine matches on the example, a tied rating scale and a simulated
three-score case. The AUCs agree to 10⁻¹², the covariances to 10⁻¹⁴ and the
chi-square to 10⁻⁷. On the 109 rated CT images in Hanley and McNeil's (1982)
paper, it gives an AUC of 0.8932, and the paper reports 0.893.

## Limits and what's next

The test only compares scores measured on the same rows. Two AUCs from
different samples need an unpaired comparison, which the tool doesn't have
yet. The interval for a single AUC is the usual Wald interval, which can be
too narrow for an AUC near 1 with few cases. Cut-offs chosen on a sample look
better on that sample than on new data. Covariate-adjusted and time-dependent
ROC are the obvious next modes.

These are numbers about one public data set and an example model, not advice
about breast cancer diagnosis. The data are the UCI Breast Cancer Wisconsin
(Diagnostic) set (Wolberg, Mangasarian, Street and Street 1993, CC BY 4.0).

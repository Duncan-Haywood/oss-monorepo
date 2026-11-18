---
title: "The BCG trials agree on average and disagree everywhere else"
seo_title: "Meta-analysis calculator: random effects, forest plot, I-squared"
date: 2026-11-16
description: "A free meta-analysis tool checked against statsmodels and metafor. On 13 BCG trials the pooled risk ratio is 0.49, but the prediction interval runs past 1."
tags: [meta-analysis, research-algorithms, statistics, verification]
---

The repository had a tool for correcting many tests at once
([false discovery rate](../../ventures/fdr-multiple-testing/README.md)) and one for two
reviewers who must agree ([inter-rater agreement](../../ventures/inter-rater-agreement/README.md)).
It had nothing for the step that sits between them in a systematic review: combining one result
from each of several studies. [meta-analysis](../../ventures/meta-analysis/README.md) now does
that in the browser, from the command line and as an agent call.

## What it does

Paste one row per study: event counts in two groups, means with SDs, or an estimate with its
confidence interval. The tool pools them with a random-effects model. It estimates the
between-study variance tau-squared three ways: REML (the default), DerSimonian-Laird and
Paule-Mandel. It shows the usual Wald interval beside the Knapp-Hartung one, I-squared with its
own confidence interval, and a prediction interval for the next study. It also draws a forest
plot, a funnel plot with Egger's test, a leave-one-out table and an optional meta-regression on
one study-level number. Everything is implemented from the papers; no third-party code was
ported.

## Checked against two other implementations

On the bundled data, the DerSimonian-Laird, Paule-Mandel and Knapp-Hartung results agree with
statsmodels 0.15.0 to 1e-6 or better. REML agrees with a separate direct maximisation of the
likelihood in scipy. The bundled data are the 13 BCG vaccine trials compiled by Colditz et al.
(1994, *JAMA*). metafor's README fits these trials and prints tau-squared 0.3132, I-squared
92.22%, an estimate of -0.7145 and a Knapp-Hartung interval of -1.1084 to -0.3206. The tests
assert every one of those digits, and the same for the meta-regression below.

## The finding: the average hides the spread

On the risk-ratio scale the pooled answer is 0.49 (95% CI 0.34 to 0.70). The vaccine roughly
halves the risk of tuberculosis on average. Many summaries would stop there.

The trials do not agree with each other, though. I-squared is 92% (81.9% to 97.7%), so nearly
all the spread is real difference between trials, not chance. The 95% prediction interval for
a new trial's true risk ratio is 0.13 to 1.79. That range runs from a strong effect to slight
harm. Two trials in the set sit near 1 or above: TPT Madras (1.01) and Comstock and Webster
(1.56).

Latitude explains most of it. In a REML meta-regression on each trial's absolute latitude, each
degree further from the equator multiplies the risk ratio by 0.971 (Knapp-Hartung p = 0.0046).
The between-trial variance falls from 0.313 to 0.076, so latitude accounts for 75.6% of it.
metafor's README fits the same model, and the tool matches its printed output to every digit. Egger's test finds no clear funnel asymmetry (p = 0.19), and no single
trial, left out, changes whether the result is significant.

## Why the default interval matters

The tool shows two confidence intervals because the usual one is too narrow with few studies.
`eval/coverage.mjs` simulates 2000 meta-analyses for each of six settings (5, 10 or 20 studies;
moderate or large heterogeneity) and counts how often each 95% interval contains the true mean.

| studies | mean I² | Wald (REML) | Knapp-Hartung | prediction interval holds |
| --- | --- | --- | --- | --- |
| 5 | 52% | 87.5% | 93.2% | 90.5% |
| 10 | 60% | 90.8% | 93.8% | 89.7% |
| 20 | 67% | 93.8% | 95.5% | 92.6% |

With five studies and real heterogeneity, the Wald interval missed one time in eight instead of
one in twenty. Knapp-Hartung stayed within two points of 95% in every setting, at the cost of an
interval about 1.4 times wider with five studies and 1.07 times wider with twenty. The
prediction interval held 85% of true study effects when heterogeneity was modest. REML often
estimates tau-squared near zero there, and the interval then shrinks. The full table is in the
[README](../../ventures/meta-analysis/README.md#verification).

## Limits

A pooled number is only as good as the review behind it: the tool does not search for studies,
screen them or judge their risk of bias. Large-sample variances need a fair number of events per
study; sparse tables call for Mantel-Haenszel or one-stage models, which are not here yet. A
meta-regression compares studies, not people, and is exploratory with fewer than ten.

## Next

Trim-and-fill, subgroup tests on a categorical column, Mantel-Haenszel pooling for sparse
tables, and multilevel models for several effects from one study.

*Written with AI assistance. Statistical output, not medical advice.*

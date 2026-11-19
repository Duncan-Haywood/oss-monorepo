---
title: "The wages you never see: a Heckman selection model in the browser"
seo_title: "Free Heckman selection model online: two-step and maximum likelihood"
date: 2026-11-18
tags: [heckman, sample-selection, econometrics, statistics, research-algorithms, browser]
description: "A free Heckman sample-selection tool: probit, two-step and maximum likelihood beside OLS, and a simulation of life without an exclusion restriction."
---

A wage is recorded only for people in paid work. A loan's loss is recorded
only for loans that were approved. If the people who work are the ones with
unusually good wage offers, a regression of wages on schooling among workers
describes them, not everyone, and collecting more workers does not help. That
is sample selection bias, and James Heckman's 1979 correction for it is one
of the most used tools in applied economics. The new
[Heckman selection tool](../../ventures/heckman-selection/) runs it in the
page, the command line or an agent call, with nothing uploaded: the selection
probit, OLS on the selected rows, Heckman's two-step estimator with the
Heckman-Greene corrected standard errors, and full maximum likelihood with
conventional, robust or clustered errors, side by side.

## The example

The bundled data are simulated (2,000 women, seed 20261118, the script is in
the source), so the truth is known. A year of schooling raises the log wage by
0.085, and the unobserved drive that makes a woman more likely to work also
raises her wage, a correlation of 0.6. Young children, older children and
other household income change who works and have no direct effect on wages.

| | educ coefficient (SE) |
| --- | --- |
| Truth | 0.085 |
| OLS on the 1,213 workers | 0.0745 (0.0052) |
| Heckman two-step | 0.0823 (0.0056) |
| Maximum likelihood | 0.0840 (0.0057) |

The correction moves the estimate most of the way back. Maximum likelihood
puts rho at 0.496 (95% interval 0.297 to 0.653, covering the true 0.6), and
the likelihood-ratio test of no selection gives 19.1 on one degree of
freedom.

## What 3,000 simulated studies say

One draw is an anecdote, so `eval/coverage.mjs` redraws the design 1,000
times at n = 1,000 in three scenarios and counts how often each 95% interval
contains the true 0.085:

| Scenario | OLS | Two-step | Max. likelihood |
| --- | --- | --- | --- |
| rho 0.6, with exclusion restrictions | 57.4% | 95.5% | 95.3% |
| rho 0 (no selection bias) | 94.8% | 94.2% | 94.2% |
| rho 0.6, no exclusion restriction | 27.7% | 100.0% | 79.0% |

With a valid exclusion restriction both corrections do what they promise.
When there is no selection bias, correcting costs almost nothing, and the
likelihood-ratio test rejects 6.1% of the time at the 5% level.

The last row is the interesting one. Without a variable that moves selection
and not the outcome, the model is identified only by the curvature of the
normal distribution. The two-step estimate stays centred on the truth but its
interval is ten times wider (median 0.317 against 0.033), and its rho came out
outside [-1, 1] in more than half the draws. Maximum likelihood gives narrow,
confident intervals around a biased centre (0.074) and covers 79% of the
time. To check that this was the estimator and not a lazy optimiser, a second
script compared the engine's maximum with the likelihood at the true
parameters in 60 such draws: the engine's was higher every time. The
likelihood is flat in a direction the data cannot pin down, and the peak it
has is in the wrong place.

So the page warns when there is no exclusion restriction, and reports how
collinear the inverse Mills ratio is with the regressors (Puhani 2000), which
is the symptom.

## Checked against

The probit, OLS under three kinds of errors, and the two-step coefficients and
corrected standard errors agree with statsmodels 0.15 and a separate numpy
implementation within 1e-12. The maximum-likelihood estimates agree with an
independent scipy maximisation within 1e-7, and the standard errors within
1e-5, about the accuracy of the reference's numerical second derivatives. It
has not been compared with Stata's `heckman` or R's `sampleSelection`, which
were not available where it was built; a report that it disagrees with them
would be welcome.

Next, if it is used: marginal effects on the expected outcome among selected
rows, and a semiparametric check of the normality assumption.

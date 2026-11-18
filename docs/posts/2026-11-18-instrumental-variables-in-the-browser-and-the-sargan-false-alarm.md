---
title: "Instrumental variables in a browser tab, and a Sargan test that rejected valid instruments"
seo_title: "Free 2SLS and IV regression tool with weak-instrument tests"
date: 2026-11-18
tags: [instrumental-variables, 2sls, causal-inference, econometrics, research-algorithms, browser]
description: "A free IV tool matches linearmodels within 1e-11. On its example, Sargan rejects valid instruments (p = 0.029) because errors are clustered; Hansen J does not."
---

Does another year of school raise wages, or do the people who stay in school
longer just earn more anyway? Regress wages on schooling and you get both
answers mixed together: whatever pushes people to stay in school (ability,
family, motivation) also pushes their wages up. More data does not help.
The bias does not shrink with the sample size.

The standard fix is an **instrument**: something that changes how much
schooling people get but has no other route to their wages. The classic one
is whether you grew up near a college. The new
[instrumental variables tool](../../ventures/instrumental-variables/) runs
that whole toolkit in a browser tab, the command line or an agent call, and
nothing is uploaded.

## What it does

You give it a CSV, the outcome, the regressor you suspect (the
"endogenous" one), one or more instruments and any controls. It prints:

- **OLS, two-stage least squares, LIML and Fuller** side by side. All four
  are one formula with a different weight *k* (0 for OLS, 1 for 2SLS), so
  you can see at a glance whether the choice of estimator matters.
- Standard errors that are **unadjusted, robust or clustered**.
- **How strong the instruments are**: the first-stage F, the partial R², Shea's
  partial R², and the *effective F* of Montiel Olea and Pflueger (2013),
  which is the one to read when errors are not homoskedastic.
- **Sargan and Hansen J** tests of whether several instruments agree, and
  **Durbin, Wu-Hausman and control-function** tests of whether IV was
  needed at all.
- The **Anderson-Rubin confidence set**, which does not rely on the
  instruments being strong, with a chart of the test across coefficient
  values.

## Does it give the right numbers?

Every number was checked against
[linearmodels](https://github.com/bashtage/linearmodels) 7.1, run as a
separate program. There were three specifications (two instruments, one
instrument, and two endogenous regressors), each under all six choices of
standard error. Every coefficient, standard error, first-stage statistic and
test agreed. The largest gap was 9.4e-12, from the control-function test.
The Anderson-Rubin set's endpoints were checked a different way, by
root-finding on linearmodels' own regressions with scipy, and agreed within
1.7e-13. The suite has 96 tests and runs in under 2 seconds.

## The example, and the false alarm

The example data are 3,000 simulated people in 150 counties. Ability is
left out of the file. It raises both schooling and wages, so OLS should
overshoot. The true return to a year of school is 0.08. Two county traits act
as instruments: whether a four-year college is nearby, and public tuition.
Both are valid by construction, because neither touches wages except through
schooling.

| | Return to a year of school | 95% interval |
|---|---|---|
| OLS | 0.107 | 0.100 to 0.114 |
| 2SLS, county-clustered | 0.064 | 0.019 to 0.109 |
| Anderson-Rubin, clustered | | 0.019 to 0.108 |

OLS is confidently wrong. 2SLS is less precise and its interval contains 0.08.

The interesting part is the overidentification test. **Sargan's test rejects:
p = 0.029.** Read naively, that says one of the instruments is invalid. But
both are valid. Sargan assumes independent errors. Here the errors share a
county-level shock, and the instruments vary only at the county level, so
the test counts 3,000 independent people when it effectively has 150
counties. **Hansen's J with county-clustered errors does not reject: p =
0.14.** Robust errors that ignore the clustering don't fix it either (p =
0.026). The result page says which test matches the standard errors you
picked, so a reader who uses clustered errors sees Hansen's J first.

## The coverage study did not show what I expected

The textbook story says 2SLS intervals fail with weak instruments, and the
Anderson-Rubin set saves you. I redrew the example's design 1,000 times in
three versions: as shipped (median effective F 113), with the instruments'
effect cut to 30% (median F about 10), and the weak version again with
ability's effect on wages raised fivefold. Here is how often each 95%
interval, clustered by county, contained 0.08:

| Design | 2SLS | LIML | Anderson-Rubin |
|---|---|---|---|
| Strong (F ≈ 113) | 94.5% | 94.3% | 93.9% |
| Weak (F ≈ 10) | 95.0% | 95.7% | 92.2% |
| Weak, strongly endogenous | 94.7% | 95.5% | 92.6% |

Each figure has a Monte Carlo standard error of about 0.7 points. In this
design 2SLS held up at an F of 10. The textbook failure needs a weaker first
stage or more endogeneity than this. The Anderson-Rubin set came out **1 to 3
points short**. Some of that is overidentified AR sets that come out empty
(11 to 17 draws per 1,000), which count as misses. The rest comes from
estimating a cluster covariance from 150 clusters. The usual small-sample
factors recovered at most half a point.

The AR set's promise is about instrument strength, not about how well the
covariance is estimated. When the first stage was weak, it did what it
should: in 15 to 24 draws per 1,000 it widened to two rays or the whole line,
where the Wald interval stayed narrow and confident. The page's limits now
say plainly that it covered 92 to 94%, not 95%.

## What's next

Conditional likelihood-ratio inference (Moreira 2003), which is more
powerful than Anderson-Rubin when there are several instruments; the tF
critical values of Lee, McCrary, Moreira and Porter (2022) for the one
instrument case; and a harsher simulation design that actually breaks the
2SLS interval, so the tool can show that failure as well as describe it.

The tool is free and MIT licensed. Its results are statistical estimates
from your data, not advice, and no statistic can test the assumption IV
rests on: that the instrument reaches the outcome only through the
regressor.

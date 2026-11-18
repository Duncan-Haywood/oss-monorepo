---
title: "Kaplan-Meier, log-rank and Cox regression in the browser, pinned to two reference libraries"
seo_title: "Free Kaplan-Meier calculator with log-rank test and Cox regression"
date: 2026-11-11
tags: [survival-analysis, kaplan-meier, cox-regression, log-rank, research-algorithms, browser]
description: "A new free tool draws Kaplan-Meier curves and fits Cox models from a pasted CSV, and its tests hold every number to lifelines and statsmodels."
---

"How long until it happens, and does the group matter?" is one of the most
common questions anyone with event data asks: how long customers stay on each
plan, how long a pump runs before it fails, how long until an invoice is paid,
how long a patient stays in remission. The standard answer is survival
analysis, and until today the portfolio's
[research-algorithm tools](../../portfolio/research-tools/README.md) did not
have it. The new [survival analysis tool](../../ventures/survival-analysis/)
takes a CSV with one row per subject, a time column and an event column, and
returns Kaplan-Meier curves, the median time to event with its interval, a
log-rank test, and a Cox proportional hazards model. It runs in the page, from
`node cli.mjs`, and through the agent tool runner.

## Why build it, given R and lifelines exist

The methods are seventy years old and every statistics package has them. The
gap is the person without R or Python: an analyst with a spreadsheet export,
a student, a SaaS founder asking whether annual-plan customers really stay
longer. We did not survey the web calculators aimed at that person. What we
wanted, whatever they offer, was the Cox model's key assumption,
proportional hazards, checked on the same screen as the hazard ratio, because
that check is where a hazard ratio most often goes wrong.

## Matching two libraries, not one

A survival tool that is a little wrong is worse than none, so the tests do
not compare against numbers we computed ourselves. A script,
`eval/reference.py`, fits four data sets with **lifelines 0.30.3** and
**statsmodels 0.15.0** and writes every result to a JSON file. Three of the
data sets are synthetic and seeded, built to be awkward: times rounded so
that many events tie (the case where Efron's and Breslow's approximations
differ), three groups, and a three-level text covariate. The JavaScript tests
then require:

- every Kaplan-Meier value to match lifelines to 1e-12, and the
  log(-log) band limits to 1e-9;
- medians and their intervals exactly, and the restricted mean to 1e-10;
- the log-rank statistic to 1e-10, and the Gehan-Breslow and Tarone-Ware
  variants to statsmodels' `survdiff` to 1e-9;
- Cox coefficients to statsmodels to 1e-8 and the partial log-likelihood to
  1e-10, for both tie methods.

One finding from this: lifelines and statsmodels disagree with each other
in the fifth significant figure on the tied data sets, because lifelines stops
its Newton-Raphson iterations earlier. Our coefficients match statsmodels to
eight places, so the lifelines comparison runs at 1e-4. If you compare tools
on tied data and see a difference in the fifth digit, convergence tolerance
is the first thing to check.

## The example: 6-MP against placebo

The bundled example is the 1963 leukaemia remission trial of Freireich and
colleagues: 42 children, half given 6-mercaptopurine and half placebo.
Patients on placebo relapsed after a median of 8 weeks (95% CI 4 to 11). On
6-MP the median was 23 weeks; the upper end of its interval is not reached,
because more than half of the 6-MP group was still in remission when last
seen. The log-rank chi-square is 16.79 on 1 degree of freedom (p = 4.2e-5),
and the Cox hazard ratio for placebo against 6-MP is 4.82 (2.15 to 10.8).
lifelines and statsmodels give the same numbers, and the tests pin them as
plain values so a regression shows up as a changed number.

The check earns its place on the same data. Add the log white-cell count and
sex as covariates: the treatment effect holds (hazard ratio 4.50), but the
proportional-hazards test for sex comes out at p = 0.052. That is borderline
evidence that the sex effect changes over follow-up, so a single hazard ratio
for sex would average over an effect that is not constant. The page shows
this p-value in its own column beside the hazard ratio, so the reader sees it
before deciding to trust that ratio.

## What it does not do

Every subject starts at time 0 and is followed until the event or censoring.
There is no late entry, no time-varying covariates, no strata, no competing
risks, and no parametric (Weibull) fit, and the page says so. The
proportional-hazards statistic is the approximate Grambsch-Therneau form that
lifelines uses and that R used before 2019; current R computes an exact
version, which can differ slightly. If this tool gets used, a stratified Cox
model is the natural next step, because it is the usual answer when the check
flags a term like sex here.

*Statistical output from the data you supply. Not medical advice.*

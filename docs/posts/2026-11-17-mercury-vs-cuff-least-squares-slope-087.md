---
title: "Mercury against the cuff in 4,212 adults: least squares says 0.87, Passing-Bablok says 1.02"
seo_title: "Free Passing-Bablok and Deming regression online, with Bland-Altman"
date: 2026-11-17
tags: [method-comparison, passing-bablok, deming-regression, bland-altman, clinical-chemistry, research-algorithms]
description: "A free method-comparison tool on NHANES blood pressure: the cuff reads 1.3 mmHg below mercury; least squares wrongly finds a 13% proportional error."
---

A lab buys a new analyser. A study swaps a mercury column for an automatic
cuff. Before anyone trusts the new numbers, someone measures the same samples
both ways and asks: do they agree, and if not, is the difference a constant
offset, a percentage, or both? The textbook answer is three methods that
spreadsheets do badly: **Passing-Bablok regression**, **Deming regression**,
and the **Bland-Altman plot**.

The new [method comparison tool](https://marisstella.app/method-comparison/)
runs all three in the browser, with the confidence intervals and the
difference between the methods at decision levels you choose. It is free, MIT
licensed and uploads nothing.

## A real comparison: NHANES 2017-2018

The 2017-2018 National Health and Nutrition Examination Survey ran a blood
pressure methodology study. Participants were measured by a physician with a
mercury sphygmomanometer and by a technician with an Omron HEM-907XL
oscillometric cuff, in random order, three readings each. Of the adults, 4,212
have all six systolic readings. Taking the mean of each method's three:

- **Bland-Altman:** the cuff reads **1.31 mmHg lower** on average (95% CI 1.01
  to 1.61). Limits of agreement: **−20.9 to +18.2 mmHg.** Close on average, but
  246 of the 4,212 people (5.8%) fall outside those limits.
- **Least squares**, regressing the cuff on mercury, gives a slope of
  **0.872**. Read literally, the cuff under-reads high pressures by 13%.
- **Passing-Bablok** gives **1.0232** (95% CI 1.0003 to 1.0413) and **Deming**
  **1.0172** (0.9950 to 1.0395).

The 0.87 is not a property of the cuff. Least squares assumes the x variable
has no error. Here it does: three mercury readings are a noisy measure of a
person's pressure. That error drags the fitted slope toward zero. Cornbleet and
Gochman showed this in *Clinical Chemistry* in 1979. Deming regression models
error in both methods. Passing-Bablok sidesteps the question by taking a
median of pairwise slopes, which is the same whichever method you call x.

At **130 mmHg** the tool puts the cuff 1.23 mmHg below mercury (Deming
jackknife interval 0.87 to 1.58). Passing-Bablok's CUSUM test finds no
curvature (p = 0.88).

These describe this sample of adults, without survey weights, not the U.S.
population. The NCHS report on the study (Ostchega et al. 2021) is the
official analysis. The file and its provenance are in the repository.

## Passing-Bablok on 8.85 million slopes

Passing-Bablok needs the median of every pairwise slope, shifted by the
number of slopes below −1. For 4,212 pairs that is 8,850,570 slopes after
dropping identical points and slopes of exactly −1. Listing and sorting them
in a browser tab is slow and uses a lot of memory.

The tool never lists them. The number of slopes below a trial value *t* is the
number of pairs whose order by *x* and order by *y − t x* disagree, and a merge
sort counts those inversions in O(n log n). That counting idea comes from the
slope-selection literature (Dillencourt, Mount & Netanyahu 1992). Bisect on *t*
until the count crosses the rank you want, and you have the order statistic. A
few dozen counts per statistic, four statistics, and the whole analysis (with a
weighted Deming jackknife) takes one to two seconds.

To check it, a test runs 400 random data sets full of ties, vertical pairs and
slopes of exactly −1, and compares against sorting every slope: the slope,
the interval, N and K match every time. Readings are scaled to integers first
when they have up to nine decimals, so "exactly −1" really is exact.

## What was checked, and one surprise

- An independent Python reference (numpy and scipy, written from the papers):
  Deming against the closed form (1e-10) and scipy's orthogonal distance
  regression; the jackknife against refitting each leave-one-out set;
  Passing-Bablok against every slope listed in exact fractions; Kendall's tau
  against scipy. That ran on 33 generated data sets and the NHANES file.
- Bland and Altman's own 1986 peak-flow example reproduces their bias (−2.1
  l/min), SD (38.8) and limits (−79.7 to 75.5).
- On 1,000 simulated data sets of 60 pairs with a known truth, the 95%
  intervals covered the true slope 95.5% of the time for Deming and 95.4% for
  Passing-Bablok.

The surprise was the CUSUM linearity test. Divide the largest cumulative sum
by √(points below the line + 1) and compare it with the Kolmogorov
distribution, and the false-alarm rate on straight-line data *grows with n*:
2.4%, 5.5% and 8.2% at 30, 60 and 200 pairs. Dividing by √(all points off the
line + 1) is the one under which the sum, with signs in random order, behaves
like a Brownian bridge. It is conservative here, because the line was fitted to the same
points: at most 0.1% false alarms at the nominal 5%. It still caught a
moderate curve 87.8% of the time. The tool uses the second and says so.

While choosing references we also read the Python package methcomp 1.0.0. Its
Deming slope uses `np.cov(x, y)[1][1]`, the variance of y, where the covariance
belongs, so we did not use it as a reference.

## Try it

Paste two columns, or load the NHANES file, Bland and Altman's peak-flow data
or a small made-up lab set: [marisstella.app/method-comparison](https://marisstella.app/method-comparison/).
Command line: `node cli.mjs pairs.csv --levels 120,140`. It is a statistical
estimate, not a method validation report; your standard or regulator sets the
protocol and the acceptable difference.

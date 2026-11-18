---
title: "How many frogs did nobody catch? Capture-recapture on 29 years of USGS data"
seo_title: "Free capture-recapture calculator: Lincoln-Petersen, Chapman, Chao"
date: 2026-11-18
tags: [capture-recapture, mark-recapture, ecology, statistics, research-algorithms, browser]
description: "A free capture-recapture tool on USGS chorus frog data: two frogs per frog seen in 2010, a fourfold model split in 1999, and where each estimator fails."
---

Catch some animals, mark them, let them go, and catch again. If a lot of the
second catch carry your mark, you have probably caught most of them; if very
few do, many more are out there. That overlap is the whole idea behind
capture-recapture, and the same arithmetic counts the bugs your code
reviewers missed or the cases missing from every registry. The new
[capture-recapture tool](../../ventures/capture-recapture/) takes capture
histories (one row per animal, a 0 or 1 per occasion), two-sample counts or
capture frequencies, and reports Lincoln-Petersen and Chapman, the classic
closed-population models M0, Mt and Mb by maximum likelihood, Chao's
estimator for animals that differ in catchability, and the jackknife. It runs
in the page, the command line or an agent call, and nothing is uploaded.

## The frogs

The U.S. Geological Survey has published 29 breeding seasons of capture
histories for boreal chorus frogs at Lily Pond in Colorado (Muths 2020,
[doi:10.5066/P9BZAPLB](https://doi.org/10.5066/P9BZAPLB)), with three to five
survey days in each season. Within one season the breeding population is
close to closed (no frogs arriving or leaving), so each year can be estimated
on its own. Three seasons each show something different.

**2010: the count you see is not the population.** 270 frogs were caught and
57 of them more than once, the most recaptures of any year. Model Mt (catch
probability varies by day) wins on AIC and puts the breeding population at
539, with a 95% profile-likelihood interval of 455 to 656. That is about two
frogs for every one anyone saw.

**1999: the model can matter more than the data.** 120 frogs, with catches
falling over the three days: 68, 39, 23. Model Mb, which reads the fall as
most frogs already being marked (a "trap response"), wins on AIC with 95% of
the weight and says 135. Model Mt, which reads the same fall as frogs being
less active on later days, says 493. Both are honest readings of the same
numbers. AIC picks one, but only the survey's effort records could settle
which story is true.

**2007: too few recaptures, no answer.** One frog out of 88 was caught twice.
Mt's interval runs from 474 to about 33,300. The tool says that the data
cannot pin the number down rather than printing a confident figure.

These are per-season readings of a dataset whose authors fitted
open-population models across all the years. They are not a reanalysis of
that study.

## Where each estimator fails

Every estimator comes with assumptions, so the tool ships a simulation
(`eval/coverage.mjs`, 1,000 studies for each of five ways to generate data)
that shows what happens when they are wrong:

- When the data come from a model, that model's 95% interval covered the
  true size 94.5% to 95.5% of the time.
- When animals differ in how catchable they are (here, capture probabilities
  drawn from a beta distribution), M0, Mt and the AIC-chosen model covered it
  only 2.4% to 13.4% of the time and underestimated by about 19%. Chao's
  estimator covered it 85.5% of the time.
- Chao's estimator has its own failure. With every animal equally catchable
  it overestimated by a median of 13.9% over four occasions and 64% over two.
  Chao (1987) designed it for many occasions and low catch rates, and the
  numbers show why.

So the page shows all of the estimates side by side instead of choosing one.
When they disagree by a lot, that disagreement is the finding.

## Checking it

The engine profiles the capture probabilities out in closed form. The
reference script does not: it lists every possible capture history,
maximises the full multinomial likelihood numerically with scipy, and checks
that likelihood against `scipy.stats.multinomial.logpmf`. On six simulated
studies the two agree on every model's estimate exactly and on the interval
limits to one part in a million. The tool also reproduces the worked example
in Chao's 1987 paper, 135 penned rabbits trapped for 18 nights: N = 134 with
a normal interval of 87 to 181, as printed. Her log-transformed interval is
printed as 103 to 202, and the tool gives 102.4 to 202.4. The README records
that gap of less than one animal; we have not traced its cause.

## Next

The obvious next step is a heterogeneity model fitted by likelihood (a
two-class mixture for Mh, then Mth), so that the AIC table can include the
assumption that fails most often in the field. After that come individual
covariates.

*Built with AI assistance. The methods follow the cited papers, and every
number above comes from files in the repository.*

---
title: "What a one-segment conjoint gets wrong, and what it still gets right"
seo_title: "Free choice-based conjoint tool: design, part-worths, willingness to pay"
date: 2026-11-18
tags: [conjoint-analysis, pricing, market-research, discrete-choice, research-algorithms, browser]
description: "A free CBC tool, tested on simulated buyers with known tastes: aggregate logit shrank the price coefficient by 15%, yet willingness to pay landed within 10 cents."
---

Choice-based conjoint is how product teams find out what a feature is worth.
Instead of asking "how much do you value compostable packaging?", it shows a
few versions of the product side by side, at different prices and with
different features, and asks which one the person would buy. Twelve of those
screens per person, a few hundred people, and a logit model turns the picks
into utilities, importance, willingness to pay and simulated market shares.

The software that does this is usually a paid survey suite or an R script. The
new [conjoint analysis tool](../../ventures/conjoint-analysis/) does both
halves in the browser: it designs the survey (balanced levels, D-efficient,
with the number of respondents needed) and analyses the answers. Nothing is
uploaded, and the same engine runs from the command line and as an agent call.

## Testing it where the answer is known

A model that fits real answers can't be checked against the truth, because
nobody knows the truth. So the example is simulated: a meal-kit subscription
with price per serving ($7 to $13), recipes per week, menu, delivery and
packaging; 300 respondents, 12 tasks of three kits plus "none". Each simulated
person has their own utilities, drawn around known means, which is how real
markets look: some people care a lot about price, some hardly at all.

First, the engine has to fit the model it claims to fit. On four simulated
studies it matches statsmodels' `ConditionalLogit`, which does its own dummy
coding, to 1e-7 on every coefficient and 1e-6 on every standard error
([`eval/reference.py`](../../ventures/conjoint-analysis/eval/reference.py)).
When everyone really does share one set of utilities, its 95% intervals cover
the truth 95.0% of the time (2,400 intervals over 400 studies).

## What one set of utilities does to a varied market

The tool fits an aggregate logit: one set of utilities for everybody. Run that
on 200 repeated meal-kit studies, where people differ, and compare with the
means the data were drawn from
([`eval/coverage-output.txt`](../../ventures/conjoint-analysis/eval/coverage-output.txt)):

| | True mean | Average estimate |
|---|---:|---:|
| Price, per dollar | −0.450 | −0.381 |
| Chef's premium menu | 0.500 | 0.463 |
| Pick any delivery day | 0.400 | 0.344 |
| 5 recipes a week (vs 2) | 0.600 | 0.535 |

Every coefficient of clear size comes out 7 to 15 percent too small. This is
not a bug. When tastes vary, the population's choices look noisier than any
one person's, and a single logit reads that extra noise as weaker preferences.
Anyone comparing raw utilities from an aggregate model with a hierarchical
Bayes run on the same data will see the same gap.

## What survives

Willingness to pay is a ratio of two coefficients, and both shrink by roughly
the same amount, so most of the shrinkage cancels:

| Willingness to pay, $ per serving | True | Average estimate |
|---|---:|---:|
| Pick any delivery day | 0.89 | 0.90 |
| Compostable packaging | 0.56 | 0.57 |
| Chef's premium menu | 1.11 | 1.22 |
| 4 recipes a week (vs 2) | 1.22 | 1.31 |

The level-by-level WTP lands within 1 to 10 cents of the true ratio. The one
quantity that does not survive is the "none" constant, which varies most
between people in this simulation: its implied value is $1.08 against a true
$0.67. A share simulator leaning on "none" to predict how many people buy at
all should be read with that in mind.

The other thing that goes wrong is the standard errors. Twelve answers from
one person are not twelve independent facts, and with varied tastes the usual
model-based standard errors understate the real study-to-study spread by 5 to
19 percent. Standard errors clustered by respondent come within 6 percent of
that spread, so the tool's intervals use them, and the bootstrap behind the
importance, WTP and share intervals resamples whole respondents for the same
reason.

## What it means if you run one

- Rank features and read willingness to pay from an aggregate model; don't
  quote its raw utilities as the size of anyone's preference.
- Treat "none" shares as the weakest number on the page.
- Size the study before fielding it: the design step prints the expected
  standard error of every coefficient for 100 to 500 respondents. For the
  default four-attribute SaaS example it says about 400 respondents bring all
  of them to 0.05.

Next for the tool, if people use it: individual-level utilities (hierarchical
Bayes or a mixed logit), which would fix the shrinkage instead of describing
it, and prohibited level pairs in the design.

The tool: [marisstella.app/conjoint-analysis](https://marisstella.app/conjoint-analysis/).
Source, tests and the simulation: [`ventures/conjoint-analysis/`](../../ventures/conjoint-analysis/).

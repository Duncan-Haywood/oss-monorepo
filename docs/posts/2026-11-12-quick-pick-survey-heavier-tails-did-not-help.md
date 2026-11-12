---
title: "We gave a survey's intervals a heavier-tailed prior. They got narrower and wrong."
seo_title: "Student-t vs Gaussian prior for pairwise intervals: a negative result"
date: 2026-11-12
description: "A Student-t prior should fix a Gaussian that over-shrinks extremes. In 108 simulated survey cells it covered less every time, even on heavy-tailed truth."
tags: [quick-pick-survey, surveys, ranking, statistics, bayesian, negative-result]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
you to pick one of two options, over and over. Your results screen refits all
your answers at once with a Bradley-Terry model and gives a 95% interval for
the gap between any two items: how sure we are that you like A more than B.

Those intervals are honest but wide. They use a deliberately broad prior
(a Gaussian with sd 2 on the logit scale), and they hold the true gap 95-97%
of the time at a half-width of about 2.4 logits. Earlier today we tried
narrowing them by estimating the prior's width from the survey's
respondents. That got the width down by a fifth but held only about 93% of
the time, and we wrote down a likely reason: a Gaussian prior pulls every
item toward the middle in proportion to its distance from it, so the
options you love or hate most get pulled in hardest, and the intervals
involving them miss.

The textbook answer to that is a heavier-tailed prior, a Student-t, whose
pull fades for items far from the middle. So we built one and tested it.

## What we tested

The refit now takes a `priorDf` option: Infinity is the old Gaussian, and
any positive number is a Student-t with that many degrees of freedom. The
scale is picked the same way as the Gaussian's width, by maximising the
evidence (the marginal likelihood) of an independent panel of 40 simulated
respondents, estimated by importance sampling. Unit tests check the density
against its closed form and numerical integration, the fit against a
finite-difference gradient and Hessian of a posterior written out in the
test, and the evidence against 2-D quadrature.

Then we ran 108 simulated cells: 8, 15 and 30 items, 2, 4 and 8 answers per
item, two question orders, honest and careless respondents, two seed sets,
and three shapes of true preference with the same spread: uniform, normal,
and Laplace (a few items far out, the case a t prior is built for).

## What happened

Honest respondents, standard question order, share of pairwise 95%
intervals that held the true gap / half-width:

| true preferences | fixed Gaussian | estimated Gaussian | t, 7 df | t, 3 df | t, 1 df (Cauchy) |
|---|---|---|---|---|---|
| uniform | 0.969 / 2.42 | 0.942 / 1.90 | 0.920 / 1.80 | 0.880 / 1.70 | 0.801 / 1.67 |
| normal | 0.968 / 2.42 | 0.930 / 1.86 | 0.912 / 1.77 | 0.879 / 1.67 | 0.809 / 1.66 |
| Laplace | 0.964 / 2.41 | 0.913 / 1.78 | 0.899 / 1.70 | 0.875 / 1.60 | 0.828 / 1.61 |

Every step toward heavier tails made the intervals narrower and less
reliable, even on the heavy-tailed truth. The adaptive question order showed
the same pattern.

## Why the textbook fix failed here

A prior with heavier tails and the same overall spread has to be more
sharply peaked in the middle. The evidence also gave the t a smaller scale
than the Gaussian's sd. Most items sit near the middle, so most pairs got
pulled together harder, and their intervals came out too confident. The
long tail helped the one or two items far out and hurt every other pair.

The diagnosis we started with was mostly wrong, too. Pairs involving the
top or bottom fifth of items did miss a little more often than the rest
under the estimated Gaussian, but only by 1 to 4 points. The extremes were
never where most of the shortfall came from.

The data agreed. When we let the evidence choose among the Gaussian and the
three t priors, it chose the Gaussian in 90 of 108 honest cells, including
35 of the 36 with uniform truth.

## One more thing it turned up

The estimated Gaussian isn't safe for these intervals either. In one cell
(15 items, 8 answers each, adaptive order, second seed set) the pooled width
estimate fell to 0.33, near its floor, and only 39% of intervals held. The
"who could be your favourite" list on the same screen isn't hurt by a
collapse like that, because it uses the narrower of two estimates, and a
narrower prior only makes that list longer. The intervals have no such
guard.

## What ships

No change for users: the intervals keep the wide fixed prior, the only
option here that held 92% or more in every honest setting. The t option
stays in the library, tested but unused, for the next experiment. The next
two questions are why the pooled estimate collapses under the adaptive
order, and whether intervals from posterior draws beat the Gaussian
(Laplace) approximation, since the adaptive order asks exactly the pairs
where that approximation fits worst.

Everything here is simulation. Real rankings tell us people's orderings but
not the true size of the gaps, so these intervals can't be checked on them.
The full tables, the careless-respondent rows and the raw output are in
`docs/INFORMATION-GAIN-SELECTOR.md` ("A heavier-tailed prior for the
pairwise intervals") and `docs/t-prior-intervals-2026-11-12.jsonl`.

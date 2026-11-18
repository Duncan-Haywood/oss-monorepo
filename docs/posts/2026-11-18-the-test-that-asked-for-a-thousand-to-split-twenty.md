---
title: "The test that capped each channel at 1,000 to split a budget of 20"
seo_title: "Halving an ad-spend optimizer's test suite without changing an answer"
date: 2026-11-18
tags: [performance, ad-spend-saturation-optimizer, testing, optimisation]
description: "Half of the ad-spend optimizer's test time was one test building 80,000 budget totals to read one. Lowering a cap that could never bind, plus two bit-identical fixes to the curve fits, took the suite from 10.5 s to 5.1 s."
---

The [ad-spend saturation optimizer](../../ventures/ad-spend-saturation-optimizer/README.md)
fits a diminishing-returns curve to each ad channel's weekly spend and revenue, then splits a
budget across channels with an exact dynamic programme. Its test suite took 10.5 seconds, and
5.3 of those went to one test.

That test checks the optimizer against a hand-solved answer: two exponential curves, a budget
of 20, split where the marginal returns are equal. It allowed each channel to take up to 1,000.
The dynamic programme builds the best revenue for every total the channels could reach, so it
built 80,000 totals (two channels at 40,000 steps of 0.025) to read the one at 20.

A channel can never take more than the whole budget, so a cap of 20 asks the same question.
It is not just the same answer to within a tolerance: at the 800-step total the programme only
ever reads spends up to 800 steps from either channel, in the same order, so both caps return
a split of 12.725 / 7.275 and revenue of 117.98293620674329 to the last bit. One took 5.6 s and
the other 14 ms. The assertions did not change.

Two smaller changes went into the fitting code that the web page runs too, both checked
against the old code on 72 analyses and 420 direct fits and optimiser calls with an identical
hash of every output:

- **Bootstrap resamples repeat about a third of their weeks.** The fit now evaluates the curve
  once per distinct spend and still adds up the squared errors point by point in the original
  order, so the sum is the same number.
- **The Nelder-Mead optimiser re-sorted its three or four vertices every step** by building an
  index array and two new arrays. A stable insertion sort in place gives the same order.

Together those took about 12% off an analysis of the example account (2.22 s to 1.95 s for five
runs). The rest is the curve arithmetic itself: 18 starting points of up to 600 steps for the
S-shaped curve, and fewer of either would move the fitted numbers. That is a product decision,
written down for a later run in the
[perf note](../history/ci-perf-2026-11-18-ad-spend-dedup-fits.md).

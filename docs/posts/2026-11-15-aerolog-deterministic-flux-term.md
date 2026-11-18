---
title: "A drone conflict model with no Monte Carlo, and what it says about the Monte Carlo"
seo_title: "Exact drone conflict rate without Monte Carlo: altitude layer splits"
date: 2026-11-15
tags: [research, uav, airspace, monte-carlo, closed-form]
description: "An exact drone conflict closed form, summed over every destination pair, shows 400,000-pair estimates picked a worse altitude split in 5 of 24 layouts."
---

The airspace half of
[`aerolog-scaling`](../../research/aerolog-scaling/README.md) asks a planner's
question: when eight delivery-drone operators share a city, which of them
should share an altitude layer? For weeks the programme has answered it with a
closed form, a formula for how often two operators' drones come within 50 m of
each other. It needs only hub sites, destination lists, speeds and market
shares. One part of it has always been computed by sampling: 400,000 random
pairs of flights per layout, averaged. Today's step removed the sampling.

**The trick is that sampling was never needed.** The closed form is an
average of a fixed function over random pairs of (operator, destination)
rows, so its expected value is a finite weighted sum over every pair of rows.
With about 80,000 destinations that is roughly 2.5 billion pairs of flight
paths to test for a crossing in each layout. Done in blocks with numpy, that
takes about two minutes per layout. A brute-force loop over the old per-pair
code checks it to nine decimal places. Add the take-off term that an earlier
step (11t) already computed exactly, and the whole model is deterministic.

It agrees with the sampled version: over 24 random eight-operator layouts
over New York, the pooled ratio is 1.004, and 16 fresh seeds on four layouts
average 0.995 to 1.000. It also matches the exact (but sampled) conflict
estimator within 2% in 22 of 24 layouts.

## What the noise-free version showed

**The sampled estimates were noisier than they looked.** At 400,000 pairs the
sampled crossing term varies by about 0.8% from run to run in a typical
layout, and by up to 1.9%. The noise is heavy-tailed. Two drones whose paths
cross at a shallow angle stay close for a long time, so a few near-parallel
pairs dominate. On one draw, the top 1% of flight pairs carried between a
quarter and over half of the whole sum.

**Earlier agreement figures were flattered by shared noise.** Steps 11s and
11t reported the closed form within 0.25% of the exact estimator on average,
with a scatter of 0.33% across layouts. Both numbers were computed on the
same sampled flight pairs, so the noise cancelled in the ratio. Against the
noise-free closed form, the exact estimator's own scatter is 0.9%, almost
three times larger. The closed form is as accurate as a 400,000-pair
reference can tell, and no more can be claimed yet.

**Noise changed decisions.** Choosing the best two-layer split on the sampled
closed form gave a different split from the noise-free one in 5 of 24
layouts. On the noise-free weights those splits cost 0.16% to 2.75% more
conflicts. Scored against the sampled exact estimator, three of them even
looked about 0.45% better, because that estimator shares the sampled pairs.
With 40,000 pairs the split was wrong in about a third of cases, and the worst
cost 9%.

**The paper-only shortcut is fine on level.** Step 11u's grid weights, which
need no destination list at all, come out at a median of 0.999 of the
noise-free crossing term. Their layout-to-layout scatter (0.90 to 1.07) is
real raster error, not reference noise.

## What it means

For a planner, the closed form is now a pure function of public inputs, with
no random seed and no question of "did you run enough samples". For the
programme, it is a noise-free yardstick. Split differences under about 0.5%
that earlier steps scored against the sampled estimator can't be resolved,
and the next step is to make that estimator exact the same way.

The usual limits apply: straight legs, no avoidance or wind, one city, and
2014 ride-hail pickups standing in for deliveries. Losses are scored on the
closed form's own weights. Seven predictions were written down before any
layout was run, and four held. The full log, code and results are in the
[project README](../../research/aerolog-scaling/README.md) and its `LOG.md`.

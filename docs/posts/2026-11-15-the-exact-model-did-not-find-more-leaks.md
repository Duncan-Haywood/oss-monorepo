---
title: "We gave a leak localiser the exact hydraulic model, and it found no more leaks"
seo_title: "BattLeDIM leak localisation: exact model vs nominal model"
date: 2026-11-15
tags: [research, water, leak-detection, digital-twin, BattLeDIM]
description: "On BattLeDIM L-Town, the generator's own model places 15 of 32 leaks within 300 m, against 16 for the nominal model. The slow leaks' residual fails."
---

This morning's [step 15](/research/water-leaks/) ended with a confident
sentence. On the BattLeDIM L-Town benchmark, a perfect residual (the exact
pressure effect of the leaks) helped a model-based leak localiser by only one
leak, so we wrote that the hydraulic model must be what limits localisation.
Step 16 tested that directly, and the sentence didn't survive.

## The test

BattLeDIM publishes two network models. `L-TOWN.inp` is the nominal model the
competitors got. `L-TOWN_Real.inp` is the model the organisers generated the
data with. Every pipe differs between the two: diameters are a median 2.1%
smaller in the real one, roughness is within about ±9%, and each node has its
own demand pattern.

So we computed leak signatures from the real model itself. For each of the 32
leaks we restarted the real model at the hour we localise it, with the tank
level and pump state the leak-free network had at that moment. Then we drew
the leak's true flow at each of the 782 junctions in turn and recorded the
24-hour pressure change at the 33 sensors. That came to 25,056 EPANET runs,
about 17 minutes on four cores. A check came first: the restarted leak-free
runs match the continuous two-year simulation exactly.

With the true model, the true day, the true leak size and the exact residual,
we expected at least 24 of 32 leaks within 300 m. We wrote that down
beforehand, along with four other predictions.

## The result

- the generator's own model, on each leak's day: **15 of 32** within 300 m;
- the nominal model from step 15: 16 of 32;
- naming the sensor whose pressure fell most: 14 of 32.

None of the differences comes near significance (paired sign tests, P = 1.0).
All five predictions failed. The leak pipe's own end node scored best for only
5 of the 32 leaks.

## Where the misses are

After the predictions were scored, we split the leaks by type:

- the 15 **abrupt** leaks: 11 within 300 m with the real model, 11 with the
  nominal model, 12 with the sensor;
- the 17 **incipient** (slow-growing) leaks: 4, 5 and 2.

We localise each leak at the first hour its flow reaches half its peak. For a
slow leak that hour comes a median five weeks after onset, and the residual is
measured against the day before onset. Over those five weeks the network's
other leaks change too: by a median 17.8 m³/h, against the slow leak's own
6.7 m³/h. So most of the "leak's residual" is other leaks. Split at the median
of that ratio, the real model places 12 of the 16 cleaner cases within 300 m
and 3 of the 16 dirtier ones (Fisher exact P = 0.004). We chose this split
after seeing the results, so it is a lead for the next step, not a finding.

## What changes

For abrupt leaks with a clean residual, the nominal model already does as well
as the exact one. On L-Town, the 2% diameter error doesn't cost localisation.
The residual does: a baseline fixed when a slow leak starts goes stale while
everything else in the network keeps moving. That is the part a utility could
act on. A localiser for slow leaks needs a baseline that tracks the other
changes in the network, not a better-calibrated pipe model.

Everything here is an oracle bound on a simulated network: the true model,
leak times and sizes are things no utility has. The next step replays the
other leaks through the generator's model, so each residual holds one leak
only. That will separate contamination from what 33 sensors can actually
resolve.

Code, the plan written before the run and the per-leak table are in
[`research/water-leaks`](/research/water-leaks/) (step 16).

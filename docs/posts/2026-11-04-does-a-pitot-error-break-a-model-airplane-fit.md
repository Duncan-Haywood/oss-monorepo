---
title: "Does a pitot-tube error break a model aircraft's system-identification fit?"
seo_title: "Does a pitot-tube error break a model aircraft's fit?"
date: 2026-11-04
description: "A 1% pitot offset can exceed the whole airspeed perturbation and break an output-error fit in every draw; one fitted bias per channel repairs it."
tags: [aerolog-scaling, system-identification, uav]
---

# Does a pitot-tube error break a model aircraft's system-identification fit?

The `aerolog-scaling` programme asks what a small Froude-scaled model of a cargo
UAV can tell us about the full-size aircraft. To read the model's phugoid and
short-period modes from a flight record you need airspeed, and the airspeed
sensor is the weak channel.

Sized from a 1 psi differential pressure part (MS4525DO datasheet figures, span
assumed): at the model's trim dynamic pressure of 272 Pa the sensor's offset
error is 0.37 (0.25% accuracy) to 1.48 (1% total error band) times the rms of
the whole velocity perturbation. In simulation over 20 designs and 8 draws each:

- plain output-error fitting rises from 0.78% to 2.76% median short-period error
  at offset 0.37, and fails in 160 of 160 draws at 1.48;
- the same fit with one fitted bias per channel stays near 0.7 to 0.8%;
- a speed-proportional error (a gain plus an offset) changes nothing a bias
  does not remove. One cost: 8 of 160 fits failed at the 1% gain with two
  periods of data, which I read as lower signal-to-noise and did not check further.

So: fit a bias on the airspeed channel. Limits are in the paper draft, Section
4.10c: constant offset, one scale, 8 draws, no repeat seed.

Source: `research/aerolog-scaling/` (LOG.md, milestones 9aa to 9ad).

---
title: "A pitot gain error doesn't hide an aircraft's dynamics, but its offset does"
seo_title: "Pitot offset vs gain error in aircraft system identification"
date: 2026-11-04
tags: [research, aircraft, system-identification, pitot, sensors]
description: "Fitting a four-state aircraft model from noisy records: a pitot gain error is invisible to the fitted modes, while a constant offset breaks it unless fitted."
---

We are testing whether a small model aircraft's dynamics can be identified
from short flight records, to see if a scale model can stand in for a full-size
design. The airspeed channel looked like the weak point: a 1 psi pitot sensor
with a 1% error band can have an offset bigger than the whole velocity
perturbation.

A constant pressure offset has two effects on the indicated speed: a constant
shift and a gain slightly below 1 (0.97 for the 0.25% accuracy figure, 0.89 for
1%). We ran the fit with both, on 20 designs, 10% noise and records of one and
two phugoid periods.

- The gain does nothing to the fitted modes. Scaling one channel is a change of
  state coordinates, which leaves the eigenvalues alone. Median short-period
  error with a fitted bias stayed at 0.64 to 0.83%, within 0.1 points of the
  offset-only run (one exception: 8 of 160 fits failed at two periods and the
  1% gain, against none before).
- The offset is the problem. A fit that ignores it returned no usable modes in
  160 of 160 draws at the 1% size; one extra fitted bias per channel fixed that.

Details, caveats and the 160-draw tables are in the
[project log](../../research/aerolog-scaling/LOG.md) (milestone 9ac).

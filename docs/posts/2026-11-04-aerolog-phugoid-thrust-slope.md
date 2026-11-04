---
title: "Does a small model of a cargo drone have a safer phugoid than the real one?"
seo_title: "Phugoid damping of a Froude-scaled UAV with propeller thrust slope"
date: 2026-11-04
tags: [research, uav, scaled-models, flight-dynamics]
description: "A measured propeller thrust slope in a 4-state model: the phugoid is near-neutral at full size and slightly more damped in a small model, opposite to our guess."
---

The `aerolog-scaling` programme asks what a 1:N Froude-scaled model of a cargo
UAV reproduces of the full-size aircraft. Our 4-state longitudinal model had a
slightly unstable phugoid at full size because it assumed constant thrust. An
earlier step measured the thrust-speed slope of real APC propellers
(s = dlnT/dlnV, median -2.25 across 34 propellers, 5th to 95th percentile
-2.86 to -1.54), so this step put it into the model.

What happened, with thrust slope s = -2.25 and a model at 1:5 scale:

- At full size the phugoid real part moves from +0.013 to +0.004 (free
  transition) and from +0.011 to +0.000 (tripped boundary layer), in units of
  omega times the square root of span over g. It stays marginal: the sign of a
  near-neutral mode is not something this model can claim.
- Going from full size to 1:5 scale makes the phugoid more damped, by 0.005 to
  0.008, and the sign becomes stable in both transition cases. We predicted a
  change under 0.004; that was wrong. The cause is that lift-to-drag falls with
  Reynolds number (25 to 21 free, 21 to 18 tripped), and more drag means more
  drag damping.

So for the phugoid, the smaller model is not the more dangerous one. The mode
we should still worry about is the short period, whose damping falls with scale.

Limits: propeller data are from APC thin-electric and slow-flyer props, fixed
RPM, applied to a different airframe; the free-transition model at 1:10 still
loses its oscillatory pair. Code, results and the pre-registered prediction are
in `research/aerolog-scaling/` (LOG entry "Milestone 5c").

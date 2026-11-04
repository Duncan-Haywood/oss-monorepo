---
title: "Does a scale-model aircraft's phugoid grow or decay? It depends on the thrust law"
seo_title: "Phugoid damping of a Froude-scaled UAV model: constant thrust, constant power or fixed RPM"
date: 2026-11-04
tags: [research, aerospace, uav, scaling, flight-dynamics]
description: "In a four-state longitudinal model, the sign of the full-size phugoid depends on the thrust law, while the trend with scale does not."
---

The `aerolog-scaling` programme asks what a 1:N Froude-scaled model of a cargo UAV reproduces of the full aircraft. Its longitudinal model had a slightly unstable phugoid at full size, and I suspected that was an artefact of assuming constant thrust.

I measured the missing term. Over 137 APC propeller curves the fixed-RPM thrust-speed slope dlnT/dlnV has a median of -2.25 (5th to 95th percentile -2.86 to -1.54), with no detectable Reynolds dependence within a propeller. Putting it into the model, and adding a constant-power law (slope -1):

| Thrust law | slope | phugoid real part, full size (free transition) |
|---|---|---|
| constant thrust | 0 | +0.0127 |
| constant power | -1 | +0.0087 |
| fixed RPM (measured) | -2.25 | +0.0037 |

Positive means growing. Only the fixed-RPM slope gets close to zero at full size. At n = 0.2 the model is more damped by 0.0065 to 0.0083, because L/D falls from 25.2 to 21.2 and drag damping grows. It crosses zero only for the fixed-RPM slopes. So the direction (smaller means more phugoid damping) is robust, and the sign is not.

I predicted the constant-power numbers before running them, and all three predictions held. One was nearly guaranteed: the result is exactly linear in the slope, as the model's speed-derivative term is.

Limits: propeller efficiency is held constant for the constant-power case, the propellers are small electric APC ones on a different airframe, and there is no thrust-line offset. The log, code and outputs are in `research/aerolog-scaling` (milestones 5b to 5d). Written with AI assistance.

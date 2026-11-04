---
title: "A propeller's thrust-speed slope: -2.25, and no sign it changes with Reynolds number"
seo_title: "Propeller thrust vs airspeed slope from UIUC wind-tunnel data"
date: 2026-11-04
tags: [research, aerolog-scaling, propellers, scaling]
description: "From 137 measured APC propeller curves, thrust at fixed RPM falls with speed as V^-2.25 near cruise, with no detectable Reynolds-number dependence."
---

Our scaling study of a cargo UAV had no thrust term in its phugoid model, and
the phugoid's damping sign was a modelling artefact. The missing piece is how
propeller thrust changes with airspeed. At fixed RPM that is dlnCT/dlnJ, a
dimensionless number that Froude scaling keeps identical between a full-size
aircraft and its model, unless it depends on blade Reynolds number.

We read it from 137 wind-tunnel curves of 34 APC propellers in the UIUC
Propeller Database (Reynolds number at 0.75 R from 1.5e4 to 1.2e5), at the
speed of peak efficiency. The median is -2.25 (5th to 95th percentile -2.86 to
-1.54). Within a single propeller, the slope against log10 Re changes by +0.23
per decade, 95% interval -0.24 to 0.73: not distinguishable from zero. We
predicted the interval would exclude zero (40% prior); it did not.

Caveats: thin-electric and slow-flyer propellers only, a five-point
second-derivative fit per curve, and a one-decade Reynolds span. Next, the law
goes into the four-state model to see whether the phugoid damping sign
becomes physical. Code and numbers:
`research/aerolog-scaling/experiments/propeller_thrust_slope/`.

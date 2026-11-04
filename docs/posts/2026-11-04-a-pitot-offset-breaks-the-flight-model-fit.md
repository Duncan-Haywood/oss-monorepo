---
title: "A pitot offset breaks the model-aircraft fit, and one fitted number repairs it"
date: 2026-11-04
description: "A constant airspeed-sensor offset makes output-error fitting fail on a 1:5 model aircraft; fitting one bias per channel restores the mode estimates."
tags: [aerolog-scaling, system-identification, uav]
---

# A pitot offset breaks the model-aircraft fit, and one fitted number repairs it

A scale model of a cargo aircraft flies slowly, so the dynamic pressure it
sees is small: about 272 Pa at trim for our 1:5 case, 4% of a 1 psi sensor's
span. The previous milestone showed that a typical total error band of such a
sensor is larger than the whole airspeed perturbation in a phugoid.

This one fits the aircraft's longitudinal modes to simulated flight records with
a constant offset on the velocity channel, 0.37 and 1.48 times that channel's
rms, plus 10% noise. Plain output-error fitting fails on all 30 fits at the larger
offset. Adding one fitted bias per channel brings the short-period error to
about 1% and the gust error to about 5%, the same as with no offset.

Caveats: 10 designs and 3 draws each, a constant offset that sits inside the
fitted family, and one channel only. Numbers and limits are in the
[research log](../../research/aerolog-scaling/LOG.md).

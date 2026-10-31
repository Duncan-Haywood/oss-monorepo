---
title: "Real drone flights: electrical power scales as mass to the 1.54, as rotor theory says"
seo_title: "Drone flights: electrical power scales as mass to the 1.54"
date: 2026-10-27
description: "On 134 measured cruise flights of a DJI Matrice 100 the fitted mass exponent is 1.54 (95% interval 1.41 to 1.67), consistent with the m^1.5 behind Froude power."
tags: [research, uav, scaling, digital-twin]
---

Froude scaling of a sub-scale aircraft model makes power scale as n^3.5, which for a rotor is momentum theory's (m g)^1.5 / sqrt(2 rho A). Rodrigues et al. (*Patterns*, 2022) assume that 1.5 in their energy model. We fitted it instead, on their public data (Figshare, CC BY 4.0).

Over 134 cruise flights of a DJI Matrice 100 at 0, 250 and 500 g payload (3.68 to 4.18 kg takeoff), battery power rises from 440 W to 534 W, and the fitted exponent on mass is **1.54, 95% bootstrap interval 1.41 to 1.67** over flights, with speed and wind as covariates. Electrical power is 1.85 times the ideal induced power at every payload, and falls 10% between 4 and 12 m/s (translational lift).

This checks the exponent inside one airframe over a 13.6% mass range, not across size. Payload is partly confounded with flight day, density was not logged, and the interval resamples flights, not days. The log and script are in [`research/aerolog-scaling`](../../research/aerolog-scaling/README.md).

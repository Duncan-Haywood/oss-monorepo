---
title: "A glider's energy win over a REMUS costs it five days per 100 km"
date: 2026-10-27
description: "Counting time too, a REMUS-class AUV beats a Slocum-class glider in 78% of simulated pairs; the glider wins only if delay is worth under 0.7 of energy."
tags: [marine, auv, glider, energy, negative-result, marine-hull]
---

# A glider's energy win over a REMUS costs it five days per 100 km

*Written by an AI agent working in this repository. Numbers come from `research/marine-hull/experiments/results_time.txt`; both vehicles are simple models and the glider's time and hotel inputs are swept, not measured.*

The previous steps of the `marine-hull` programme found a buoyancy glider spends about 5 times less energy per metre than a REMUS-class AUV once the AUV's electronics are counted. That ignores speed. In this model the glider takes a median 5.5 days per 100 km (3.1 to 8.7); the AUV, at its datasheet top speed of 2.3 m/s, takes 12 hours.

I planned two predictions and both failed: I expected the AUV to win the energy-delay product (energy per metre times seconds per metre) in at least 90% of pairs, and the glider to need over 10 days per 100 km in at least 90% of cases. The AUV wins 77.9% of 14,580 pairs, and only 3.3% of glider cases are that slow. Along the way I changed the AUV speed grid after the first run capped it at 1.5 m/s (where it won 51.2%); the log records that.

The useful number is the tie point. Weighting delay with exponent a (energy times time to the power a), the glider is preferred for a below a median 0.72 (0.32 to 1.19). So whether a glider is the better survey platform depends on how a mission prices days against joules, which this study does not source. Currents, which push a 0.2 m/s glider far more than an AUV, are not modelled.

Log and limits: `research/marine-hull/LOG.md`, milestone 4d.

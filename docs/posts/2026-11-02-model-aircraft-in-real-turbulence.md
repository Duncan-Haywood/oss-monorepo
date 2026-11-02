---
title: "A scale model aircraft in real turbulence: the match breaks"
seo_title: "Scaled drone model vs full-size aircraft in real turbulence"
date: 2026-11-02
tags: [research, uav, scaling, turbulence]
description: "A 1:5 Froude model of a cargo UAV matches full-size load factor in scaled turbulence, but not in real air: load factor 38 to 53% low, pitch response far off."
---

A dynamically (Froude) scaled model is flown to predict how a full-size aircraft behaves. Our `aerolog-scaling` programme asks which quantities that works for. Last week's milestone found that in continuous turbulence a 1:5 model of a cargo UAV matches the full-size rms load factor within 2% but has a pitch response 25 to 40% too large. That assumed the turbulence shrinks with the model.

Real air does not shrink. Milestone 9t fixes the turbulence length in metres, so the 1:5 model sees five times as many chords of eddy as the aircraft does. Same linear flight-dynamics model, same 17 power-matched designs, Dryden vertical turbulence, deterministic.

- Rms load factor of the similar model: 38.0%, 49.3% and 52.6% *low* at turbulence lengths of 25, 62.5 and 125 full-size chords.
- Rms pitch rate: +34%, +10%, -9%. It changes sign, so no single correction factor exists.
- Rms attitude: +34% to +184%.
- None of the 17 power-matched designs is within 10% on all three metrics at any length.
- Separately, for the same wind speed in m/s the slower model sees 2.24 times the relative gust, which roughly doubles its pitch response again.

What this means: the load-factor match is a property of equally scaled gusts, not of natural turbulence. Data from a sub-scale logger in real air should be compared through the model's own spectrum.

Limits: a linear four-state model with no stall, vertical Dryden turbulence only, three lengths as a sweep, no flight data. Predictions were logged before the run; two of three were refuted. Code, results and log: `research/aerolog-scaling/` (`experiments/real_air_turbulence/`).

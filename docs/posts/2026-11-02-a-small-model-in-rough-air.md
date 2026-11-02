---
title: "A Froude-scaled model in rough air feels the right load and pitches too much"
seo_title: "A scaled UAV model in rough air pitches too much"
date: 2026-11-02
tags: [aerolog-scaling, digital-twin, sim-to-real, uav]
description: In Dryden turbulence a 1:5 Froude model of a cargo UAV keeps rms load factor within 2% but pitches 25 to 40% harder than the full-size aircraft.
---

The `aerolog-scaling` programme asks what a sub-scale model of a cargo aircraft reproduces. Earlier steps used a single 1-cos gust. This step feeds the same linear flight-dynamics model continuous Dryden vertical turbulence (length scale 25 to 125 full-size chords, scaled with the model) and compares rms response at n = 0.2 with n = 1.

The similar model keeps rms load-factor increment within 1.7% but is 24 to 29% high in rms pitch rate and 35 to 40% high in rms attitude. None of the 17 power-matched designs is within 10% on all three metrics (best worst case 14.8%). Limits: linear model, vertical turbulence only, Dryden spectrum rather than measured air, and the turbulence length is assumed to scale with the model, which real air does not. Numbers and code: `research/aerolog-scaling/experiments/dryden_turbulence/`, log entry 9s.

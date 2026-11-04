---
title: "In coastal waters an ocean glider can't hold its line more than half the time"
seo_title: "Ocean glider vs AUV in coastal currents: NOAA observed data"
date: 2026-11-04
tags: [research, marine, underwater-glider, auv, currents]
description: "Using observed NOAA current data from 64 US stations, a 0.2 m/s buoyancy glider is stalled by the cross-current in 61% of readings in the worst case."
---

Earlier in our marine-hull programme a buoyancy glider beat a propeller AUV on
energy per metre at every hotel load we could source. That used open-ocean
surface currents (OSCAR), where about 30% of the ocean runs above the glider's
0.2 m/s speed. Those fields are smoothed and understate coastal and tidal flow.

We repeated the test with observed currents: 31 days of 6-minute readings from
64 NOAA CO-OPS stations. Median speed was 0.30 m/s, and 63.5% of readings
exceeded 0.2 m/s. If the whole current is across the track, the glider cannot
hold it in 61.1% of readings; at a random heading, 41.6%. Its energy-per-ground-metre
win over the AUV falls from 69% (OSCAR, worst case) to 38%.

Caveats matter. The stations are ports, ship channels and rivers, not open
shelf, so this overstates a typical survey; it is one winter month; and the
speed is a median over depth bins. The prediction was not written down before
the run.

Code, data summary and log: `research/marine-hull/` (milestone 4h).

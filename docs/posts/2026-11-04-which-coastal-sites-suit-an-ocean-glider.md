---
title: "Which coastal sites suit an ocean glider? Read one number: the median current"
seo_title: "Ocean glider vs AUV energy by coastal current speed (NOAA CO-OPS)"
date: 2026-11-04
tags: [research, marine, glider, auv, ocean-currents]
description: "Splitting 64 NOAA CO-OPS current stations by their own median speed shows where a 0.2 m/s buoyancy glider still beats a propeller AUV on energy per metre."
---

Earlier in the `marine-hull` programme we found that a glider's energy
advantage over a propeller AUV shrinks in observed coastal currents: pooled
over 64 NOAA CO-OPS stations, it cannot hold a cross-current track 61% of the
time. A pooled number hides the useful part, which is that sites differ.

We grouped the stations by their own median current speed (calm at or below
0.2 m/s, the glider's speed; moderate 0.2 to 0.5; strong above 0.5) and re-ran
the same comparison:

| Group | Stations | Glider stalls (worst case) | Glider wins energy per ground metre (random heading) |
|---|---|---|---|
| Calm | 18 | 31.6% | 81.1% |
| Moderate | 30 | 66.6% | 55.4% |
| Strong | 16 | 84.0% | 34.6% |

The station-weighted groups reproduce the pooled 61.1%. Only 28% of the
stations are calm enough to leave the glider's advantage mostly intact.

Limits: one month (Jan 2024), US ports, channels and bay entrances chosen for
navigation rather than survey work, groups drawn from the data they are
evaluated on. Code, data and log: `research/marine-hull`, milestone 4i.

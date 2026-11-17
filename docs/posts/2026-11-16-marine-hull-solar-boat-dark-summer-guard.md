---
title: "A solar boat's dark-summer guard helps at high latitude and costs everywhere else"
seo_title: "Solar USV seasonal correction: a dark-summer guard"
date: 2026-11-16
tags: [research, marine-hull]
description: "Refusing a learned summer darker than the climatology lifts a solar boat's worst learning year from 1 to 74 of 168 at high latitude, but costs the other points."
---

A solar boat plans its battery use from a sun climatology, corrected month by month from one season of its own log. At nine high-latitude points one learning year wrecks that correction: it beats the plain 7-day trailing-mean rule in 1 of 168 test cases. The [last step](2026-11-16-marine-hull-solar-boat-summer-level-not-shape.md) found why. The damage comes from the cells where that year learned a darker summer than the boat then met. But that split needed the true summer, which a deployed boat never has.

What a boat with one learned year does have is the climatology. So this step tested the deployable version: in the local-summer months, never let a learned ratio fall below 1 (the climatology's own level), and keep any that came out brighter. We scored it on all 30 points and on each of the five possible learning years, next to a softer version, a symmetric control and 6zzo's "early-bright" summer tilt. We wrote eleven predictions down before the run, and eight held.

- **At high latitude the guard works.** Averaged over the five learning years it wins 109.2 of 168 cases, against 81.0 for the raw correction. The worst year goes from 1 to 74, and the best year barely moves (152 of 153).
- **The asymmetry is the point.** Dropping the summer correction altogether wins only 52.8. Refusing only the too-dark summers is worth twice that.
- **Everywhere else it hurts.** Over all 30 points the guard's average falls from 121.8 to 106.0, below no correction at all (139). Every case it loses, it loses on dark hours. The boat expects more summer sun, so it spends more battery and runs out at night.
- **The high-latitude gain runs through one point.** After the run we tried the guard only at latitudes of 50 degrees or more. The 30-point score recovered (123.2), but the high-latitude gain vanished: the worst year fell back to 2. The difference is one point, P-30 in the South Pacific, the only high-latitude-group point below 50 degrees. Its guarded summer tips the pooled count.
- **The early-bright tilt is a decent everyday rule, not a fix.** Applied to every learning year, it beats the raw correction at all five (133.6 on average over all 30 points) but leaves the worst high-latitude year at 2.

What this means: "erring bright is the cheaper mistake" is true only for a boat that is already short on distance. Where the boat is already near its dark-hours limit, the same nudge pushes it over. A guard on a learned correction has to look at which side of that trade the boat's plan sits on, not only at the sign of the error. That conditional guard is the next test, with the rule fixed before the run.

Limits: the climatology is itself a NASA POWER estimate; the latitude gate and the P-30 attribution came after the run and rest on pooled counts; "summer" at the equator is only a calendar label. Same boat, payload, calm-water model and sunlight data as before.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_dark_summer_guard.py`, `experiments/results_dark_summer_guard.txt`).

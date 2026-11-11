---
title: "The Wave Glider was measuring its own waves all along, and they change the answer"
seo_title: "Wave Glider speed vs on-board wave height and period"
date: 2026-11-11
tags: [research, marine-hull]
description: "With its own wave sensor in place of a distant buoy, a 2015 Wave Glider's speed goes roughly as (Hs/T)^0.53. Sea state matters more than we thought."
---

Four posts today followed one fielded Wave Glider, the "Honey Badger" that sailed from Hawaii in 2015. Each one took sea state from the nearest NOAA buoy. They found speed scaled only as wave height to the 0.22 power once the vehicle's state was held fixed. Wave period seemed to do nothing, and a perfect wave forecast added nothing to a day-ahead speed forecast. The planning advice was to forecast from the vehicle's recent speed and mostly ignore the sea.

That buoy was often 100 to 300 km away. A noisy stand-in for the real input shrinks a fitted slope toward zero, so a weak response is exactly what a bad proxy would show. As it turns out, the vehicle carried its own wave sensor, a Datawell MOSE on the float. NOAA's ERDDAP server publishes its record next to the speed telemetry, along with the on-board weather station and a battery field. None of the earlier steps had fetched them.

We wrote down seven predictions, committed them, and then ran the same fixed-state fits on 3,281 hours with on-board waves.

- **The buoy was a poor proxy.** Within a month, the log wave height at the buoy correlates only 0.20 with the vehicle's own. We had predicted 0.3 to 0.8.
- **The height response is stronger.** With on-board waves the exponent is 0.35 (95% interval 0.30 to 0.42), against 0.22 with buoys. That is still far from the 1.0 a simple quasi-steady foil model predicts.
- **Period matters a lot.** At a fixed height and vehicle state, a longer average period is slower, with an exponent of -0.71 (-0.80 to -0.61). The earlier "no period effect" post was wrong; the coarse, distant buoy period hid it. A single term for heave velocity, (Hs/T)^0.53, fits far better than height alone.
- **Wind does nothing measurable.** A 5 m/s headwind costs 0.6%, and the interval includes zero.
- **Height alone still doesn't help the forecast** (1.17 times persistence's error at 24 h). That prediction held. The next check was not registered in advance: adding period, an oracle on-board sea state cuts the day-ahead error to 0.77 of persistence (0.67 to 0.87), and to 0.67 at three days. That reverses the earlier forecasting post. The caveat is that this uses the observed sea state as a perfect forecast. An honest test needs an archived wave forecast, which is the next step.

The big speed drop on 7 August 2015 is still mostly the vehicle. Speed fell within one hour while the on-board wave height did not move, and sea state explains about 30% of the week-scale drop. The battery hit its lowest level of the mission the morning before, but the overnight drain did not change across the step, so nothing visibly switched off. A smaller drop in June that we had called a reversible event turns out to be mostly a calm spell: wave height fell from 1.78 to 1.21 m and the wind halved. The sea-state model accounts for 73% of it.

What this changes. A Wave Glider's distance per day does depend on the sea, through height and period together, roughly as heave velocity to the half power. A planner needs both from a wave forecast, not height alone. The km/day comparisons across 2024 buoy sites used the weaker exponent and no period term, so they understate how much the site matters. They are the next thing to rerun.

Limits: this is one vehicle and one mission. The wave sensor rides on the vehicle's own float, so a speed-dependent bias in it cannot be ruled out entirely. The Doppler shift of the encounter period is about 4% here, too small to explain the period effect by itself. The code, data, pre-registered predictions and both results files are in `research/marine-hull/` (milestone 6u).

*Written with AI assistance (Claude Code).*

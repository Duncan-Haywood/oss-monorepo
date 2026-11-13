---
title: "Finding the leak: a hydraulic model does no better than the sensor that dropped most"
seo_title: "Leak localisation on BattLeDIM L-Town: WNTR sensitivity vs chance"
date: 2026-11-13
description: "On BattLeDIM's L-Town, nominal-model sensitivity localisation puts 31-47% of leaks within 300 m, ten times chance, but no better than the most-affected pressure sensor."
tags: [research, water-leaks, leak-localisation, BattLeDIM, WNTR, EPANET, water-loss]
---

Ten steps of the [water-leaks programme](/research/water-leaks/) asked whether leak *detectors* on the BattLeDIM L-Town benchmark beat random alarms. This step asks the next question a leakage crew cares about: once an alarm goes off, where do you send the acoustic loggers? BattLeDIM counts a leak as found only if the reported location is within 300 m of it.

**The method is the textbook one.** WNTR ran EPANET on the nominal L-Town model 2,347 times: once as given, then once with a leak at each of the 782 junctions, at three leak sizes. Each run gives the leak's "signature", the pressure change it causes at the 33 sensors. For a real alarm we take each sensor's pressure residual over the next 24 hours and pick the junction whose signature correlates best with it. The plan and four predictions were in the log before any simulation ran.

**It beats chance by a lot.** A random junction is within 300 m of a given leak about 4% of the time. The model localises 4 of the 13 leaks our pressure CUSUM detected in 2019 (31%) and 5 of the 14 our LILA rebuild detected (36%). Localised at the hour each leak reached half its peak flow, it gets 15 of all 32 leaks (47%). Each of those is far beyond chance (P from 0.002 down to below 0.0001).

**It does not beat the obvious answer.** Name the sensor whose pressure fell most and stop there: 13 of the 32 leaks are within 300 m, with a median error of 420 m. The model's median is 436 m. The model alone gets 6 leaks the sensor misses, and the sensor alone gets 4 (sign test P = 0.75). On this benchmark, an uncalibrated hydraulic model adds no measurable localisation skill.

**Why.** Two of the predictions failed, and they point at the reason. The estimate is not stable in the assumed leak size: the same junction wins at 1, 5 and 20 m³/h for only 12% of leaks. Pressure drops grow faster than the leak flow, and with 33 sensors neighbouring junctions look almost identical. The slow, ramping leaks are 0.6 to 2.8 km off for every method. Of the 15 leaks that reach half their peak within an hour of starting, 10 are localised within 300 m.

The proposal's localisation hypothesis (half of detected leaks within 300 m) is therefore inconclusive, between its 30% refutation line and its 50% target. For the paper, the baseline any localiser on L-Town should report is the most-affected sensor, not just chance. The next step is a model calibrated from the flow and smart-meter data, with time-resolved signatures, judged against that baseline. L-Town is a simulated benchmark; nothing here is advice for running a real network.

Code, the per-leak table, the figure and the pre-registered plan are in [the project](/research/water-leaks/), step 11.

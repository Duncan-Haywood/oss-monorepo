---
title: "Two textbook fixes to leak localisation made it worse"
seo_title: "L-Town leak localisation: hourly WNTR signatures vs a 24 h mean"
date: 2026-11-14
description: "On BattLeDIM L-Town, hourly leak signatures and a flow-balance leak size put 12 of 32 leaks within 300 m, against 15 for a plain 24 h mean."
tags: [research, water-leaks, leak-localisation, BattLeDIM, wntr, EPANET, water-loss]
---

Yesterday's step of the [water-leaks programme](/research/water-leaks/) found that a hydraulic model of the BattLeDIM L-Town network places leaks about ten times better than chance, but no better than naming the pressure sensor whose reading fell most. It ended with two obvious things to try. This step tried both, with the plan and four predictions written into the log before anything ran.

**The two fixes.** Step 11 averaged each candidate leak's effect on the 33 pressure sensors over a whole day, and it assumed every leak was 5 m³/h. That threw away timing, and the answer moved with the assumed size. So this step kept the effect hour by hour: 782 junctions, six leak sizes from 1 to 30 m³/h, 4,692 EPANET runs through WNTR. It also estimated each leak's size from the water balance, as the extra flow through the two reservoir inflow meters over what a regression on the previous weeks predicts.

**Both made it worse.** Of the 32 leaks in 2018 and 2019, each localised at the hour it reached half its peak flow:

- the plain daily mean (step 11): 15 within BattLeDIM's 300 m;
- hour-by-hour: 11;
- daily mean at the estimated size: 14;
- hour-by-hour at the estimated size, the pre-registered primary: 12;
- the most-affected sensor, no model at all: 13.

No method separates from the sensor on a paired test. On the leaks our two detectors actually caught, the primary method places 23% and 29% within 300 m. That is below the programme's 30% line, so the localisation hypothesis is refuted under the method chosen in advance. It is not shown wrong in general: the daily mean stays at 31% and 36%.

**Why the size estimate fails.** The inflow balance put the leak within a factor of 2 of its true flow for only 12 of the 32. For 6 it came out negative. Day-to-day swings in town demand are as large as the leaks themselves, 5 to 30 m³/h, which is the same wall the night-flow detectors hit in steps 6 and 7.

**Why the hourly signature fails.** Part of it is the model's own control logic. The pump that fills tank T1 switches on the tank's level, and a leak almost anywhere shifts that switch by an hour. In the simulation, that puts a step of up to 0.87 m on one sensor at 5 pm, even for a 1 m³/h leak; every other hour moves by at most 0.10 m. Leaving those hours out cut the primary method's median error from 746 m to 563 m but added no leak within 300 m. The rest is demand timing: real households do not follow the model's demand patterns hour by hour, and a daily mean averages that mismatch away.

**A bug we found on the way.** The run also checks that it reproduces yesterday's estimates, and on the first run that check failed. One junction's simulated effect is the same at every sensor, so its correlation with anything is undefined, and float32 rounding of about one hundred-thousandth of a metre decided whether it won. The scorer now ignores signatures below 0.1 mm. Yesterday's counts are unchanged, and one stability figure moves from 23% to 31%. The first run's output is kept beside the final one.

**What it means.** On this benchmark the hydraulic model needs calibrating to the day (demands from the smart meters and inflows, and the tank and pump state) before it can be expected to beat the obvious sensor. Making the uncalibrated model's output richer only exposes more of its mismatch. L-Town is a simulated benchmark; nothing here is advice for running a real network.

Code, the per-leak table, the figure, the diagnostic and the pre-registered plan are in [the project](/research/water-leaks/), step 12.

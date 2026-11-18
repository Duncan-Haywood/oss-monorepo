---
title: "An underwater vehicle's heading sensor matters more than its Doppler log"
seo_title: "AUV dead reckoning drift: DVL accuracy against heading error"
date: 2026-11-02
tags: [research, marine, auv, navigation]
description: A simulation of how far an underwater vehicle can navigate on a DVL and compass, and why 0.1 degree of heading error rivals the DVL's own 0.2% error.
---

An underwater vehicle can't use GPS. It integrates the speed from a Doppler velocity log (DVL) along the heading from its gyro or compass. We built a small simulator, `research/marine-dr`, to ask how far that gets it.

On a straight track the error per metre travelled is `sqrt(s^2 + (2 sin(b/2))^2)`, where `s` is the DVL's scale error and `b` the heading bias. The simulation agrees with this to within 1%. A Teledyne Workhorse Navigator 600 is specified at about 0.2% (we read the figure from a search excerpt of the datasheet, not the PDF). One degree of heading bias drifts 1.75% of distance, 8.7 times more. The two are equal at 0.115 degree, so a buyer should check the heading reference before paying for a better DVL.

A 10 m error arrives after 3.8 km at 0.2% scale and 0.1 degree bias, and after 0.57 km at one degree. In a 20 km Monte Carlo the worst error has a median of 64 m with no fix. A surface fix every 2 km cuts it to 15 m; every 1 km to 11 m. The gyro noise and the 3 m fix quality are our assumptions, not measurements.

Two things went wrong on the way, and both are in the log. My hand-computed prediction of the 10 m distance was wrong (2.2 km, against 3.8 km). The first Monte Carlo used a gyro noise so large it swamped everything, so I discarded it and reran with a credible figure. The study is straight-track only, with no turns, currents or acoustic aids yet.

Code and numbers: [`research/marine-dr`](https://github.com/duncan-haywood/oss-monorepo/tree/main/research/marine-dr).

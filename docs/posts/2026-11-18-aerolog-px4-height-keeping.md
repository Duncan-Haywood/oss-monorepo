---
title: "Real drones hold altitude to 4 cm. The barometer, not the controller, decides how close layers can be"
seo_title: "PX4 drone altitude hold is 4 cm; barometer error sets layer spacing"
date: 2026-11-18
tags: [research, uav, airspace, PX4]
description: "17 public PX4 flight logs: the altitude controller tracks its estimate to 4 cm RMS. Barometer error, up to about 1 m, decides between 7 and 5 drone layers."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers inside the 120 m (400 ft) column. Every step since
11ai has had to guess one number: how well a single drone holds its altitude.
That guess matters. At 0.5 m of noise the planner fits six or seven layers, at
1 m five, and at 2 to 3 m four. The earlier steps swept it because no measured
figure was within reach.

Today's step (11am) measures it from real flights.

## The data

PX4 Flight Review (logs.px4.io) publishes the flight logs that pilots chose to
share. Each log holds the drone's altitude estimate and the setpoint its
position controller is tracking, so the gap between them, the flight technical
error, can be read off real flights. I searched the public index for "Mission"
flights (454 logs), kept multirotors that were not simulations and flew at
least two minutes (118), and kept only level, en-route samples: no climbs, five
seconds of settling after any altitude change, moving faster than 1 m/s.

Only 17 flights had 30 seconds of that. Most uploads are short tests, hovers
and climbs. One more flight appeared twice under two log ids; it is counted
once.

## What the logs say

The controller is very good. Across the 17 flights the altitude error has a
median RMS of **4.3 cm**. The worst flight is 6.5 cm, and the fleet figure is
4.4 cm. Within a flight the error is close to Gaussian and forgets itself in
about 1.4 seconds. I had predicted 10 to 50 cm, so that prediction failed, on
the low side.

With only that noise, the layer planner from 11al tightens the stack from
13.3 m spacing (five bands) to **9.2 m (seven bands)** in all 24 delivery
layouts at both fleet sizes. Planning with the 1 m used until now would cost
5% (12 operators) to 8% (16 operators) more losses of separation.

## The number the controller can't see

That is not the whole story. The controller holds its *estimate* of altitude
to 4 cm, but it cannot see how wrong the estimate is. The logs carry two
altitude sensors, so I checked after reading the result above (this check was
not predicted). On the same samples of the same flights, barometric altitude
minus GNSS altitude, with each flight's slow trend removed, has an RMS of a
median **0.92 m**. Some of that is GNSS noise. In the two flights with an
RTK-grade receiver, where GNSS height is good to a few centimetres, the gap is
still 0.41 and 0.90 m, so most of it looks like the barometer.

Using that as an upper bound on each drone's error puts the planner back at
**13.3 m and five bands** in the median layout, the plan 11al already had.

## What it means

The spacing decision now sits between two measured bounds, seven bands or
five, and the open quantity is the barometer's short-term error in forward
flight (prop wash and airspeed both disturb static pressure). The controller
does not matter. A Gaussian noise model at the fleet figure picks the same
plan as the full flight-by-flight mixture in every case, so planners don't
need the tails.

Caveats: 17 flights that people chose to upload, mostly calm-weather tests,
are not a delivery fleet. The upper bound counts GNSS noise as barometer
noise. The planner scores expected losses only. All of it is preliminary.

Of seven predictions, three held, one split and three failed. The code, the
per-flight statistics and the log ids are in the
[project directory](../../research/aerolog-scaling/README.md). The next step is
the barometer itself: RTK-equipped public logs give a GNSS height truth good
to a few centimetres, so searching more of them could pin the bound.

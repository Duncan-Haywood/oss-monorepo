---
title: "Barometer speed offsets differ between drone operators: the layer stack absorbs them, until cruise gets fast"
seo_title: "Barometer static-pressure offset vs delivery-drone layer spacing"
date: 2026-11-19
tags: [research, uav, airspace, PX4, barometer]
description: "Airframe-specific barometer offsets from 5 RTK flights: 13.3 m drone layers hold at 10 m/s, but at twice the offset the stack thins to 3 bands at 24 m."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers inside the 120 m (400 ft) column. Yesterday's
step (11an) measured a drone barometer against RTK-fixed GNSS height in public
PX4 logs. The noise it found (about 0.8 m) kept the stack at five two-level
bands 13.3 m apart. It also found something the planner did not model: a
**speed-dependent offset**. Air flowing past the airframe changes the static
pressure the sensor reads, so the barometer reads high or low by an amount
that grows with speed. In the 5 en-route flights where speed varied enough to
fit it, the offset at 10 m/s was -4.70, -1.44, +0.81, +1.06 and +1.55 m.

## Why this one is different

Every error the planner had seen so far was either noise that differs drone
by drone, or a pressure field that nearby drones share and that cancels in
their altitude gap. This offset is neither. It is set by the airframe and the
cruise speed. Drones of one operator fly the same airframe at the same speed,
so it cancels between them. Two operators with different airframes carry
different offsets, and that difference is a constant bias in their altitude
gap for the whole cruise. Between two operators drawing from those 5 flights,
the difference has a standard deviation of 3.3 m, more than three times the
noise.

So I expected it to widen the stack. I wrote five predictions and pushed them
before running anything: at the measured size the planner would drop to 4
bands or fewer, a plan ignoring the offsets would cost at least 25% more
losses of separation, and the offsets would cost at least 20% even when
planned for.

## What happened

Each of 12 or 16 operators drew an offset from the 5 flights, 4 draws on each
of 48 New York layouts, and the planner from 11an re-chose its spacing and
band labels with and without knowing the offsets.

- **At the measured size, the stack holds.** The planner that knows every
  operator's offset still picks **13.3 m (5 bands)** in the median layout,
  in 80 and 87 of 96 layout-draws. Ignoring the offsets costs a median **3.4%
  (12 operators) and 1.8% (16)**, not 25%. The tail is long, though: one draw
  cost 73%.
- **Knowing the spread is enough.** A planner that knows only the
  distribution of offsets, not which operator has which, is within 2% to 3% of
  one that knows each.
- **Calibrating half of it away removes the effect.** At a half or a quarter
  of the measured offset, nothing changes in any layout.
- **At twice the offset, the stack thins.** The fits stop at about 10 m/s,
  but the layouts cruise at 12 to 28 m/s, and a speed-squared law would give
  more there. As a crude stand-in I doubled the offsets: the planner then
  picks **3 bands at 24 m**, and ignoring the offsets costs a median 13% to
  16%.

Three of the five predictions failed. The planner absorbed the offset by
putting operators with similar offsets in the same or distant bands, and the
5.7 m of margin between a 13.3 m spacing and the 7.6 m (25 ft) separation
minimum covers most of the rest.

## What it means for a planner

At the speeds the logs cover, the five-band, 13.3 m stack from the earlier
steps stands. At delivery cruise speeds the airframe offset, not the
barometer's noise, is the term most likely to set the spacing. PX4 already
has static-pressure compensation coefficients for this (`EKF2_PCOEF_*`), and
on these layouts calibrating half the offset away is enough. A calibration
requirement looks cheaper than widening every layer.

## Limits

Five flights chosen by their uploaders, speed measured over the ground with
wind not removed, offsets not extrapolated past 10 m/s, so "twice" is a
stand-in, not a measurement. Operators draw offsets from those flights at
random, so two can share one airframe's offset, which helps the planner. The
logs do not say whether compensation was set. Preliminary.

The script, results and the updated paper draft (section 6.5) are in
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md)
(`experiments/hub_airspace/speed_offset.py`).

---
title: "Against RTK height, a drone barometer errs by about 0.8 m in forward flight, and the layer stack keeps 5 bands"
seo_title: "Drone barometer error vs RTK GNSS height in PX4 logs: about 0.8 m"
date: 2026-11-18
tags: [research, uav, airspace, PX4, barometer]
description: "400 public PX4 logs, 98 with an RTK fix: barometer minus RTK height is a median 0.83 m RMS in level forward flight and 0.35 m in hover."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers inside the 120 m column. The morning's step
(11am) found that PX4's altitude controller holds its own estimate to about
4 cm, so control error is not what separates drones vertically. The estimate's
own error is. With only the 4 cm, the planner packs seven layers 9.2 m apart.
With the barometer-minus-GNSS disagreement as an upper bound (0.92 m), it goes
back to five layers 13.3 m apart. The open number was the barometer's own
error, because ordinary GNSS height carries a metre or more of noise of its
own.

Today's step (11an) measures that error against a better reference.

## RTK height as the truth

An RTK-fixed GNSS receiver reports its height to a few centimetres. In such a
flight, barometric altitude minus RTK altitude is the barometer's error to
that accuracy, after a straight line in time is removed, since the line holds
the pressure drift and the pressure-setting offset that the earlier steps
model. I wrote down seven predictions and pushed them before reducing any RTK
log.

I downloaded 400 public PX4 Flight Review logs: every multirotor flight of at
least two minutes matching "RTK" in the index (59), then the newest uploads
(341). 98 had RTK-fixed solutions, and 42 had 30 seconds of level flight with
the fix held (vertical accuracy 10 cm or better). Of those, **7 flights** had
30 seconds of level flight faster than 1 m/s, and 22 had 30 seconds of level
hover. I predicted at least 15 en-route flights, so the first prediction
failed. RTK drones in public logs mostly survey, hover or test.

## What the barometer does

- **Level forward flight:** baro minus RTK has a median **0.83 m** RMS over the
  7 flights (0.33 to 1.76 m; 95% bootstrap interval for the median 0.60 to
  1.38 m). I predicted 0.25 to 0.80 m, so the median sits just above the band.
  It is about the same as the morning's 0.92 m against ordinary GNSS, so
  little of that figure was GNSS noise.
- **Hover:** a median **0.35 m** (22 flights). In the two flights with enough
  of both, forward flight is 1.2 to 2.2 times noisier than hover (predicted at
  least 1.2).
- **A speed term exists:** in the 5 flights whose speeds span 5 m/s, a fit of
  baro minus RTK against speed squared gives a median offset of **1.4 m** at
  10 m/s, positive in 3 flights and negative in 2. This is the static pressure
  error that air flowing past the airframe puts on the sensor, and its size and
  sign depend on where the sensor sits.
- **It is fast, not slow:** I predicted a correlation time of at least 5 s.
  It came out at 0.2 s. Most of the raw error is sample-to-sample sensor
  noise.

That last result changes how to read the number. An altitude estimator
averages fast noise down before the controller sees it. So, after reading the
statistics, I smoothed baro minus RTK over a few seconds. Over 5 s the
en-route median falls to **0.42 m**, but the fleet RMS only falls from 1.06 to
**0.81 m**. The two or three noisiest flights carry most of the error, and
their error is slow wander, not noise.

## What it does to the layer stack

I gave each simulated drone the noise of one of the seven flights, the
4 cm control error plus the barometer error, and reran the layer planner from
11al on its 48 layouts of 12 and 16 operators in New York. The planner picks
**13.3 m spacing, five bands, in 48 of 48 layouts**, for delivery missions and
for 30- and 60-minute missions alike. The 1 m noise assumed since 11ai turns
out to be the best plan here: its cost ratio against the measured-noise plan
is 1.0000. With the 5 s smoothed figures the answer is the same (48 of 48,
worst layout 0.1% off).

So the morning's seven-band plan, built on the 4 cm control error alone, was
the optimistic one. Real barometers in forward flight err by tenths of a
metre to a metre, some airframes add a metre or more of speed-dependent
offset, and that is enough to keep the layers about 13 m apart.

## What it does not show

Seven en-route flights, all chosen by their uploaders, are a small sample. All
seven fused GNSS height in the EKF (`EKF2_HGT_REF = 1`). Their estimate
followed RTK to 7 cm, so these drones flew on GNSS height, not on the
barometer. The barometer figure applies to a fleet that flies on barometric
height, the PX4 default. The RTK reference itself carries a few centimetres of
noise, and smoothing over 5 s stands in for a real estimator's bandwidth. The
work is preliminary. Data, scripts and results are in
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md)
(`experiments/hub_airspace/rtk_baro.py`).

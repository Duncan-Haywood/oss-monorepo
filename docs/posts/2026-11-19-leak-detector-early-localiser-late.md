---
title: "A leak detector on the clean residual finds more leaks, but a slow leak is too small to place when it alarms"
seo_title: "Leak detection then localisation on BattLeDIM: why slow leaks fail"
date: 2026-11-19
tags: [research, water-leaks, BattLeDIM, leak-detection, leak-localisation]
description: "On BattLeDIM's L-Town, a CUSUM on the leak-free residual finds 28 of 48 2019 leaks yet places only 4 within 300 m: slow leaks are too small at the alarm."
---

The [water-leaks](../../research/water-leaks/README.md) programme studies leak
detection and localisation on BattLeDIM's L-Town. L-Town is a simulated water
network with two years of sensor data and a published leak schedule, so
nothing here is a field result.

[The last step](2026-11-19-leak-alarm-retiming.md) tried to re-time the
localiser to the detector's alarm and failed. No fixed lag or vote around the
alarm came near the "oracle day", the day each leak's own flow reaches half
its peak, which no utility can know. The detector's alarms fell anywhere from
43 days before that day to 21 after it, and the obvious suspect was the
detector. It ran on raw pressures, where demand swings hide a leak for days.

## The test

So the same detector, a residual CUSUM, was run on a cleaner signal. That
signal is the published pressures minus a leak-free simulation of the network,
in which a leak shows within hours. Every setting stayed as before except the
threshold, which step 1's rule set again on 2018 alone. The localisation rule
was chosen on 2018's detected leaks from the same 17 candidates as last time.
Six predictions went into the
[research log](../../research/water-leaks/LOG.md) before the detector had
been run once.

## What happened

| | detector on raw pressures | detector on the clean residual |
|---|---|---|
| 2019 leaks detected (of 48) | 22 | **28** |
| false alarms in 2019 | 3 | 5 |
| detected and placed within 300 m | 4 | **4** |

It found six more leaks and placed none more of them. Five of the six
predictions failed, including the main one (more than 4 placed end to end).

## Why

The comparison had the wrong reference point. Measured against the leak's
*onset*, not its half-peak day, both detectors alarm at a steady point: 3 to 6
days after the leak starts. For a burst, half-peak and onset are the same day.
A slowly growing (incipient) leak reaches half its peak about **35 days**
after it starts. So the "timing scatter" last step blamed was mostly the
leak's own rise time.

That changes the picture of where the pipeline breaks:

| at the clean detector's alarm | detected | placed within 300 m | at the oracle day |
|---|---|---|---|
| bursts | 29 | **11** | 17 |
| slow leaks | 27 | **2** | 11 |

A slow leak is still a small fraction of its eventual flow when the alarm
fires. Its pressure signature hasn't separated from the other leaks' yet, so
the localiser can't place it. This split was computed after the registered
results were read, so it explains the failure but is not itself a tested
claim.

## What it means

A utility usually runs detection and localisation as one step: alarm, then
send a crew to where the model points. These numbers argue for splitting them.
Raise the alarm early, then keep re-running the localiser each day until the
signal near its pick has grown into a dated, rising source. Bursts can be
placed at once, and slow leaks need weeks. The next step tests that online
rule, chosen on 2018 and scored on 2019 by hits and by days from onset to a
correct location.

The clean residual still uses the simulator's own demand model, which no
utility has, so this detector is a bound and not a field method. With 28
detected leaks a year, differences of one or two leaks are noise.

Code, data and every number:
[`experiments/step28-detector-on-d/`](../../research/water-leaks/experiments/step28-detector-on-d/results.txt).

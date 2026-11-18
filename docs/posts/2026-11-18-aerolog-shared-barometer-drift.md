---
title: "Barometer drift since take-off: nearby drones share half of it, so altitude layers can stay 13 m apart"
seo_title: "Drone barometer drift: shared, so layers stay 13 m apart"
date: 2026-11-18
tags: [research, uav, airspace, safety]
description: "NOAA pressure data: drones zeroed at take-off share most of their barometric drift, so a 400 ft stack keeps 5 layers. Treating it as independent costs 12%."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers. Yesterday's step (11ak) measured from a year of
New York airport pressure reports that a barometer zeroed at take-off drifts
about **1.6 m** (one standard deviation) over a 30-minute flight and **3.0 m**
over an hour. The layer studies had assumed 1 m of error per drone. At 2 m or
more, step 11ai's planner drops from five bands in the 400 ft column to four.

So the obvious next move was to put 3 m into the planner and watch the stack
thin out. It turns out that is the wrong way to use the number.

## Why most of the drift cancels

A barometric drone measures height as the pressure difference between where
it zeroed and where it is now. Two drones flying near each other read the same
pressure now. That term is the same for both, so it drops out of the gap
between them. What is left is:

- the pressure change between their **two take-off times**, not over each
  drone's whole flight;
- the pressure difference between their **two take-off points** (hubs).

We measured both from the same 2014 NOAA ISD reports at five New York
airports ([Smith et al., 2011](https://doi.org/10.1175/2011BAMS3015.1)) and put
them into the 48 city layouts the programme uses. The predictions were pushed
before any statistic was computed.

| mission | one drone's drift | gap between two drones (pressure part) |
|---|---|---|
| delivery, out and back (median **3.4 min**) | 0.25 m | **0.54 m**, mostly hub-to-hub |
| 30 min | 1.56 m | 1.19 m (0.55 of the independent figure) |
| 60 min | 2.98 m | 2.17 m (0.52 of the independent figure) |

Delivery flights in these layouts are short, so drift since take-off hardly
matters. I had predicted that the whole pressure term would be under 0.3 m. It
is 0.54 m, because hubs 4 km apart sit in slightly different pressure. That
figure scales the JFK to LaGuardia difference linearly with distance. A post
hoc check over all ten airport pairs shows a floor of about 2.2 m that does not
shrink with distance. It could be instrument noise or real small-scale
pressure structure, and hourly airport data cannot tell which. So the hub term
is somewhere between about 0.5 and 2.3 m.

## What it does to the stack

The spacing is set for a 25 ft (7.62 m) separation, with 1 m of height-keeping
noise per drone. Each operator pair gets its own error distribution.

| | 12 operators | 16 operators |
|---|---|---|
| best spacing, every mission length | 13.3 m (5 bands), 24 of 24 layouts | 13.3 m (5 bands), 24 of 24 layouts |
| extra losses of separation from pressure: delivery / 30 min / 60 min | 0.0% / 0.5% / 2.7% | 0.0% / 0.5% / 2.7% |
| planner that treats the 60-min drift as independent per drone | 17.1 m, **+12.0%** | 17.1 m, **+12.4%** |

The stack does not change. The mistake that costs something is treating each
drone's drift as its own independent error. The planner then widens every
level to 17.1 m and gives up a band, and the thinner stack has 12% more losses
of separation than the plan that knows the drift is shared. In the worst
layout it is 27% more.

The practical rule: when you set layer spacing from a sensor error, use the
error in the **difference** between two drones' altitudes, not in each drone's.
For barometers in one city that difference is about half the per-drone figure
on long flights and mostly a hub-to-hub offset on short ones.

Two of the six predictions held, three split and one was refuted. Details are
in the [research log](../../research/aerolog-scaling/LOG.md) and the
[results](../../research/aerolog-scaling/experiments/hub_airspace/drift_share_results.txt).

## Limits

The 1 m of height-keeping noise is still swept, not sourced. We could not
reach a public flight-log set from the session. Airport pressures stand in for
the pressure field at hub scale, and they cannot resolve it below about 10 km.
Hourly reports with linear interpolation smooth out fast changes, so the
long-mission tails are if anything understated. Encounter times are uniform
over a mission. This is one year and one city, and the conflict model is the
programme's closed form, not a flight simulator. Preliminary.

Next: a sourced height-keeping noise figure from public flight logs, and a
denser pressure network to pin down the hub-to-hub term.

*Written with AI assistance (Claude Code). Code and data are MIT licensed in
[`research/aerolog-scaling`](../../research/aerolog-scaling/).*

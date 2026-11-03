---
title: "On the IEEE 13-node feeder, a regulator set-point beat smart inverters for solar hosting"
seo_title: "Solar hosting: regulator set-points beat smart inverters (IEEE 13)"
date: 2026-10-21
description: "300 random PV placements in OpenDSS: a 2 V lower regulator set-point added 310 kW of hosting capacity; inverter power factor and volt-var added almost none."
tags: [energy, grid, solar, opendss, research]
---

# Regulator set-point beat smart inverters for solar hosting (on one small feeder)

How much rooftop PV can a distribution feeder take before a customer sees
more than 1.05 per unit? We ran the question in OpenDSS on the IEEE 13-node
test feeder: 300 random placements of PV on 1 to 8 customer nodes, ramped up
at 30 % of peak load until the first voltage, conductor or transformer
violation, with every measure scored on the same placements.

- The median placement takes **1,015 kW** (10th to 90th percentile 510 to
  1,893 kW). Voltage binds first in 224 of 300.
- **Lowering the regulator set-point by 2 V** adds the most: +310 kW median,
  better on 74 % of placements, worse on 10 %, for 0.007 pu less margin at
  peak load.
- A **fixed power factor of 0.95** changed the median by -60 kW and the
  IEEE 1547-2018 Category B **volt-var** curve by 0. The regulators' line-drop
  compensation saw the lower current and held the voltage up. With the taps
  frozen the same measures add +110 and +60 kW.

The caveats matter more than the headline: one small, heavily loaded feeder;
snapshots, not a day; recalled conductor ampacities; the regulator settings
of the test case, which a real utility would not share. The point is that a
hosting study that leaves out regulator behaviour can rank measures wrongly.

Code, tests (the unmodified feeder reproduces the published IEEE voltages to
0.003 pu) and results:
[`research/infra-hosting`](../../research/infra-hosting/README.md).

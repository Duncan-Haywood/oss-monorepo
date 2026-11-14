---
title: "Three automatic alert floors for an eight-sensor pump, and why each one missed"
seo_title: "Alert floors on SKAB: 28, 27 and 30 of 33 faults, none passed"
date: 2026-11-14
tags: [changepoint-detection, monitoring, anomaly-detection, pre-registration, negative-result]
description: "Pre-registered on a pump testbed: giving the loudest sensor its own floor caught 30 of 33 faults but sent 2.47 false alerts per 100 checks."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a watch mode: run it on a schedule against a growing CSV and it messages you when a column changes. With many columns the noise adds up. On the normal run of the Skoltech Anomaly Benchmark's water-pump testbed (8 sensors, 33 labelled faults), the quiet default on every column sent 8.5 false alert lines per 100 checks. The budget is 2.

Three pre-registered rounds today tried to fix that with no labels: read a floor for each column off a normal day, so that small moves are not reported. Each was scored on the 33 fault runs, which were recorded on other days. The bar was the same three parts each time: at most 2 false lines per 100 checks before the faults, no more than 2 faults lost, and alerts that sit at a fault at least as often as with no floor.

| floor | faults caught | false lines per 100 checks | alerts at a fault |
|---|---|---|---|
| none | 33/33 | 6.34 | 36.8% |
| smallest move per column, equal share (round 14) | 28 | 2.27 | 46.5% |
| one ratio to each column's recent spread (round 15) | 27 | **1.40** | **59.3%** |
| the loudest column gets its own ratio (round 16, today) | **30** | 2.47 | 50.5% |

Round 15's single ratio was set by one sensor. The thermocouple makes sharp steps on a flat trace, so 31 of the 37 lines that set the ratio were its own, and the ratio came out at 4.94. Round 16 split that column off with its own ratio (22.4) and gave the other seven a shared one (2.60). The valve faults came back: 15 of the 16 inlet-valve faults were caught against 12, and flow rate alone caught 25. The false alarms came back too, mostly from the motor temperature. On the normal day it drifted slowly and none of its moves cleared even 2.60. On the fault days it sent 47 alert lines, 17% of them at a fault.

The pattern across the three rounds is one column whose normal day did not predict its other days. Moving the floor did not fix that. So no automatic floor ships. What ships is the hand-set version: `watch.mjs --min-spread 2.5` drops moves smaller than 2.5 times the column's wiggle over the 60 points before them, and `--min-spread temperature=8` sets it for one column. One number works across columns in different units, which `--min-shift` cannot do.

Caveats: SKAB is one testbed, 16 of its 33 faults are near-copies of one valve fault, and this is the fourth look at it, so a fresh labelled multi-sensor set is the test that would mean the most. Scripts, outputs and the pre-registrations are in the tool's README ("Round 14" to "Round 16").

---
title: "Count a leak alarm only once the leak is real, and the BattLeDIM ranking flips"
seo_title: "Flow-gated scoring of BattLeDIM leak detectors"
date: 2026-11-13
description: "Credit a leak alarm only once the leak carries 1 m³/h and pressure CUSUM drops to chance (P = 0.32) while smart-meter night flow beats it (P = 0.001)."
tags: [research, water-leaks, leak-detection, BattLeDIM, minimum-night-flow, evaluation, benchmarks]
---

The [last step](/posts/2026-11-13-the-small-leaks-pressure-found-were-luck/) of the [water-leaks programme](/research/water-leaks/) ended on a problem with the scoring rule, not with a detector. On the BattLeDIM L-Town benchmark, an alarm counts as a detection if it falls within 30 days of a leak's onset. Five of 2019's small leaks are slow ramps that leak almost nothing for weeks. The pressure detectors had been credited with four of them at the hour the leak carried 0.01 to 0.22 m³/h, on a network that draws about 200 m³/h. Those credits were luck.

The obvious fix is to start the clock when the leak is real. We wrote the rule down before computing anything: an alarm can count for a leak only from the first hour that leak's own flow reaches 1 m³/h, and for 30 days after that. We also wrote three predictions. Then we rescored all six detectors the programme has built, unchanged, with the chance level (the same number of alarms at random hours) computed under the same rule.

## What happened

| detector | old rule: found of 19, P(chance) | gated at 1 m³/h |
|---|---|---|
| pressure CUSUM (D1) | 13, P = 0.105 | **11, P = 0.32** |
| LILA, run blind | 14, P = 0.019 | 13, P = 0.013 |
| night flow less smart meters (M3) | 13, P = 0.32 | **15, P = 0.001** |

The ranking flips. Our pressure CUSUM is never below chance at any gate from 0.5 to 5 m³/h. The night-flow statistic, with the 82 smart meters' use subtracted, sits below P = 0.005 at every gate. Its 0.001 survives a correction for testing six detectors; LILA's 0.013 does not, and LILA is back above 0.05 at a 2 m³/h gate.

Two of the three predictions failed. We expected LILA to lose some of its small-leak detections and to fall back to chance. It kept all seven: later alarms re-earned the ramps it had been credited with early. The third prediction held. Night flow still detects the small leaks later than pressure (median 689 h from the gate for the primary night-flow detector, 115 h for the CUSUM), so the programme's hypothesis that night flow is the faster tool for small leaks is refuted under both rules.

## Why so fragile

Going through it alarm by alarm, the whole change is two or three leaks out of 19. The CUSUM loses two ramps whose alarms came before the leak reached 1 m³/h, and one alarm that now goes to a different, overlapping leak. Night flow turns three alarms that used to be false into hits: one lands in a ramp's window that now runs later, and two pick up leaks after earlier alarms are reassigned. On a benchmark this size, "at chance" and "clearly better than chance" can be two leaks apart, and which two depends on a matching rule no published L-Town comparison states.

One score did not move. When the sensor that raised the alarm is required to be within 300 m of the leak, both pressure detectors beat chance under every rule we tried. Random alarms almost never manage it.

## What it means

For anyone comparing leak detectors on L-Town, report the detection-only count under a stated flow gate and without it, next to its chance level. Rank methods on location, not on detection counts. For a utility, night flow with smart-meter subtraction is not useless: it finds most leaks eventually, but it is slow, and it cannot say where to send the crew.

L-Town is a simulated network with simulated leaks, and the gate uses the benchmark's ground-truth leak flows, so it is a scoring rule, not something a detector can see. The code, results and plan are in [`research/water-leaks`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/water-leaks), step 8.

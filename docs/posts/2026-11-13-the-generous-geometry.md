---
title: "We picked the most generous geometry by accident: a hydraulic fuel threshold over 384 cases"
seo_title: "Fixed pump vs load-sensing excavator fuel: break-even over 384 cylinder geometries"
date: 2026-11-13
tags: [heavy-hydraulics, research, excavator, real-data]
description: "Yesterday's answer was 2.5 L/h. Rerun over every cylinder geometry we could not rule out, the median is 1.0 L/h, and the case we had used sat at the 99th percentile."
---

Yesterday the [heavy-hydraulics programme](https://marisstella.app/research/heavy-hydraulics/)
asked when a cheap fixed open-centre pump, shrunk to about 40% of stock flow,
burns less fuel than a load-sensing pump on a real excavator's motion. A
smaller pump wastes less oil, but it slows the machine on demand peaks, and the
engine keeps running through the extra time. Because the dataset has no fuel
signal, we computed a threshold instead: the fixed pump wins only if the rest of
the machine burns less than **2.46 L/h** over that extra time.

That number came from one geometry. The dataset (`fuxi-robot/excavator-motion`
on Hugging Face, folder 75, CC BY-NC-SA 4.0) gives joint angles and speeds, not
cylinder flow, so turning motion into oil means choosing levers, a bucket
cylinder sign and how much flow swing takes. Earlier steps carried 384 such
choices because none could be ruled out. Yesterday the data host refused us, so
the fuel step used only the central one.

Today the host answered. Before computing anything we wrote six predictions into
the [research log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/heavy-hydraulics/LOG.md),
then reran the threshold exactly for all 384 cases (11 seconds).

What came out:

- The central case reproduced: 2.462 L/h.
- **The median over 384 geometries is 1.00 L/h** (0.33 to 3.00). The central
  case sits at the 99th percentile. We had predicted a median of 1.5 to 3.5. Wrong.
- The threshold beats the loader's lowest measured fuel rate (1.48 L/h) in 18%
  of cases, and its full rest-of-machine rate (5.15 L/h) in none. Across all
  41,472 combinations of geometry, margin, pressure, fuel slope and pump
  efficiency, 0.1% pass 5.15 L/h.
- Swing matters most. Charge swing no flow and the median falls to 0.49 L/h.
- We predicted that peakier demand would raise the threshold, reasoning from
  the loader comparison. Within this machine it is the other way round
  (Spearman −0.59): the peakier the demand, the more samples a parity-sized pump
  slows, so the time it costs grows faster than the energy it saves.

So the honest summary changes from "it depends on whether the engine burns
under 2.5 L/h" to "on most readings of this machine, it would have to burn
about 1 L/h or less". We have still not found a sourced no-load fuel rate for a
40 to 50 kW excavator engine to set against it. A search turned up a dealer
idle-cost table for a much larger machine and emission papers that give ratios,
not litres per hour. Neither is a source for this class, so we use neither.

The fuel slope and pump efficiency are borrowed from a measured wheel loader,
and the flow and pressure come from different machines; the
[project page](https://marisstella.app/research/heavy-hydraulics/) lists the
limits. The script, the 384-case table and the results are in
[`research/heavy-hydraulics/experiments/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/heavy-hydraulics/experiments).

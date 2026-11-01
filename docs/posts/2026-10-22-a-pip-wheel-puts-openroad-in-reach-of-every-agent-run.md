---
title: "A pip wheel puts OpenROAD in reach, and ABC's delay does not survive placement"
seo_title: "OpenROAD from a pip wheel, and why ABC's delay shifts in placement"
date: 2026-10-22
description: "Placing 40 MAC engines on SKY130 with the pip openroad wheel: ABC's area ranking holds (Spearman 0.997+), delay ranking mostly not; wires add 36% (median)."
tags: [research, eda, simulation, fidelity]
---

# A pip wheel puts OpenROAD in reach, and ABC's delay does not survive placement

*Written by an AI coding agent from `research/eda-postplace`. Numbers are from
`experiments/results.txt` there: placement-level estimates with an ideal clock
and no routing, not sign-off.*

Many projects in this repository score chip designs with Yosys and ABC only, and
each listed "add an OpenROAD rung" as a next step. The blocker was that an
earlier project compiled OpenROAD from source for about 1.5 hours. This run
found that `pip install openroad` installs a working copy in seconds. Its Tcl
`initialize_floorplan` and `make_tracks` segfault, so the floorplan goes through
the Python API and there is no routing, but placement, parasitic estimation and
`repair_timing` run, about 5 s per 2000-cell design.

On the 40 MAC-engine designs at two ABC targets (80 placements):

- **Area carries over.** ABC area ranks repaired area at Spearman 0.997 to 0.999.
- **Delay mostly does not.** ABC delay ranks the placed period at 0.61 to 0.80,
  wires add a median 36% to the period, and up to 1.99x for 8-lane arrays.
- **Feasibility is the casualty.** At 5 ns, 15 designs pass in ABC and none after
  placement. At 8 ns, 39 pass in ABC, 1 after placement alone, 27 after repair.
- **The area-times-latency winner (p4w4) does not move**, which supports the
  earlier clock-sweep conclusion.

Caveat: repair stops once timing is met, so repaired periods are capped at the
target and should not be used to rank speed.

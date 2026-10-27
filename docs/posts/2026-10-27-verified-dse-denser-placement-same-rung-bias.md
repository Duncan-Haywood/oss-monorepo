---
title: "Denser placement did not change which chip-design shortcuts mislead"
date: 2026-10-27
description: "Rerunning 600 SKY130 place-and-route points at 65% utilisation instead of 40% left the cheap-rung ranking errors where they were."
tags: [verified-dse, research, chip-design, design-space-exploration]
---

The [verified-dse](../../research/verified-dse/) programme asks when cheap stages of a chip flow (generic gates, liberty mapping, placement) can stand in for the full routed result when searching over synthesis pass sequences. Until now every measurement used 40% placement utilisation, a single operating point.

This run repeated the five larger designs (three multipliers, two 64-bit adders), 60 pass sequences and two clock targets each, at 65% utilisation: 600 OpenROAD runs, about 85 minutes on four cores. Four predictions were written first. All four held:

- The mapped-netlist rung still mis-ranks the 24- and 32-bit multipliers at the relaxed clock (regret 13.4% and 11.2%, against 11.3% and 14.1% at 40%).
- Median regret of that rung moved by 0.4 and 1.2 points, with overlapping intervals.
- The routed rung got slower, 24.4 s per point against 19.4 s, not cheaper.
- Rejected runs: 100 against 96.

So the earlier picture is not an artefact of one density. It is still one axis of one corner, with one tool version; the slow liberty corner was run separately in milestone 24. Results and log: [`experiments/util65/`](../../research/verified-dse/experiments/util65/results.txt).

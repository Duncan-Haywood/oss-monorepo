---
title: "The line where load-sensing stops beating open-centre on a small excavator"
date: 2026-10-30
tags: [research, heavy-hydraulics, excavators]
description: "Two margins decide whether a load-sensing pump beats an open-centre one on a small excavator. A sweep draws the boundary instead of arguing over one point."
---

Our heavy-hydraulics programme asks which hydraulic circuit gets a small excavator closest to stock energy use. Three of our recent steps each swapped in a sourced number and each flipped the answer. A Politecnico di Torino thesis model gave a 25 bar load-sensing (LS) margin, and open-centre came out ahead. Rexroth's A10VO manual gave a 13.8 bar standby setting, and LS came out ahead. A Danfoss worked example gave 20 bar, and the two circuits tied.

Rather than keep swapping points, we swept the margin from 8 to 32 bar against three open-centre neutral pressures (1.44 bar from a valve catalogue, plus an assumed 5 and 10 bar), at a load factor of 0.346 taken from one measured electric excavator.

The median LS/open-centre shaft-energy ratio rises steadily with the margin. It crosses 1.0 at 19.3, 23.9 and 28.4 bar for the three neutral pressures, so each bar of neutral drop moves the break-even by about 0.92 bar. Below the line load-sensing uses less energy; above it, open-centre does. The two sourced margins sit on opposite sides, which is why the earlier steps disagreed.

We predicted 25 to 27 and 30 to 33 bar for the second and third crossings. Both came in lower, and the log says so. This is a simulation on an assumed cycle shape, with an assumed 2 L/min standby flow. It says which two numbers to measure, not what a real machine does.

Method, results and the draft paper: [`research/heavy-hydraulics`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/heavy-hydraulics).

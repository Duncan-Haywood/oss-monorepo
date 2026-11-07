---
title: "A sub-scale tail redesign survives a 25% lift-slope error"
date: 2026-11-07
description: "Cutting the tail lift slope by up to 25%, the error measured in NeuralFoil against UIUC wind-tunnel data, leaves the same 6 of 17 wings with a tail that restores the full-size flight modes to within 5%."
tags: [research, uav, aerolog-scaling]
---

The aerolog-scaling programme asks what a 1:5 model of a cargo drone tells you about the full-size aircraft. Its tail search found that for some wings a redesigned tail restores the phugoid and short-period modes to within 5%. That search used NeuralFoil's lift slope, and three comparisons with measured wind-tunnel polars had shown NeuralFoil's slope 12 to 30% too steep at the tail's Reynolds number.

So I re-ran the search with the tail slope cut by 0, 10, 15, 20 and 25%. At 0% it reproduces the earlier result exactly (78 of 4,474 tails pass). At every cut the same 6 of 17 wings keep a passing tail, and the full-size-like wings keep 25 to 29 each. The count of passing tails is not monotone (78, 80, 86, 78, 88), because the grid picks a different section, area and arm as the slope falls. A builder should therefore re-run the search with a measured slope rather than copy the earlier design.

Limits: the cut is uniform, and the measured sections were not the tail's own NACA 0012 or 0015. Code and results: `research/aerolog-scaling/experiments/tail_slope_cut/`.

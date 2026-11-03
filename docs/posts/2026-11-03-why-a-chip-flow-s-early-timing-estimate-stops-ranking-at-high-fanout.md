---
title: Why a chip flow's early timing estimate stops ranking at high fanout
date: 2026-11-03
description: Sweeping the fanout of one mux design from 24 to 192 shows the mapped-netlist period losing all rank information, which is when cutting candidates on it starts to lose the best one.
tags: [research, verified-dse, chips, openroad]
---
In `verified-dse` a cheap early score (R2, the mapped netlist) cuts candidate synthesis recipes before the expensive routed run (R4). It failed on one design, a one-hot AND-OR mux with fanout 96, and the explanation was only a correlation.

This run changes the one thing: the control fanout W (24, 48, 96, 192), same logic depth, 33 usable recipes per width, OpenROAD 26Q3.

- Kendall tau of the period, R2 against R4: 0.34, 0.33, 0.30, 0.00.
- Best routed period over best mapped period: 1.36, 1.75, 1.85, 3.25.
- Pick regret when R2 chooses: 0, 0, 0, 16.3 percent.

So the failure grows with fanout, and by W = 192 the mapped period tells you nothing about the routed order. It did not reproduce the earlier 13.7 percent at W = 96 (here 0.0, with a newer tool version and a different sample), and ranking on area alone was worse, not a fix (19 to 54 percent regret). One design family, one clock, no intervals. Log: `research/verified-dse/LOG.md`, milestone 73.

---
title: "Is exact steepest-edge pricing worth building for a lumber cutting-stock LP?"
seo_title: "Dual simplex steepest edge for cutting stock, measured"
date: 2026-11-09
tags: [wall-framing-takeoff, cutting-stock, simplex]
description: "Removing the row-norm term from a dual simplex leaving-row rule slows a 950-piece lumber order from 1.5 s to 2.3 s; exact weights would gain little."
---

The wall-framing takeoff orders lumber with Gilmore-Gomory column generation,
warm-started with a dual simplex. The leaving row is chosen by infeasibility
squared over the row's squared norm, an approximation of dual steepest edge.

Before maintaining exact weights, I measured what the approximation is worth on
a synthetic 950-piece, 190-length order (three runs each). With the norm term:
1.5 s, cost 3391.75. With a plain most-infeasible-row rule: 2.3 s, cost
3390.25. The norm term already saves about a third of the time. A CPU profile
shows the rest is pivoting and knapsack pricing, so exact weights could shave
pivots but not transform the run, and they must be updated through the whole
tableau each pivot. I did not build it. A real three-floor house already runs
in 6.8 s, so the next hour is better spent on a framer's real takeoff.
Synthetic order only; one machine.

---
title: "A cheap synthesis ranking failed on one high-fanout chip design and held on another"
date: 2026-10-27
description: "Two high-fanout SKY130 designs, 36 to 39 distinct outcomes each: the mapped-netlist ranking picked 14% worse on one and 0.4% on the other."
tags: [research, chip-design, search]
---

Our verified-dse programme asks when a cheap rung of an open chip flow (a mapped netlist without wires) can be trusted to rank ABC pass sequences before the slow place-and-route. An earlier test design had only two distinct outcomes, so its failure rested on one swap. This run built two high-fanout designs with 36 to 39 distinct routed scores per clock: a broadcast-gated 64-bit adder and an eight-way AND-OR mux of fanout 96.

On the adder the cheap ranking was fine (Kendall tau 0.73 to 0.80, pick regret under 0.5%). On the mux it was poor (tau 0.14 to 0.20, pick regret 13.7 and 14.6%). Successive halving that cuts gently still beat random search on both, and a five-point pilot gate still did not beat the simple arms. Two designs and 40 of 240 runs lost to ABC failures, so this is a data point, not a rule; the mechanism is untested.

Details: `research/verified-dse/experiments/fanout_rich/`.

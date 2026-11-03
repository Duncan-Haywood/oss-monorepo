---
title: "A cheaper gate for chip-flow search did not work, and why that is useful"
seo_title: "Why an R2 versus R3 placement gate fails in chip design search"
date: 2026-11-03
tags: [research, chips, openroad, negative-result]
description: "A gate that checks synthesis scores against six placed probes cannot tell when BOHB will get stuck on multiplier designs at relaxed clocks."
---

The verified-dse programme searches open-source SKY130 chip flows by ranking candidates on cheap fidelity rungs (R2 synthesis, R3 placement) before paying for routing (R4). Earlier milestones found a risk: on multiplier designs at a relaxed clock, cutting on the R2 score discards the best design for good, and BOHB stays at 6 to 9% regret while random routing reaches under 1%.

Milestone 70 tried a gate with six routed probes. It halved the tail but not more. Milestone 71 tried a gate that costs no routing: place six probes and check whether R2 and R3 agree. Over 48 design and clock cells and 100 paired seeds it was worse than plain BOHB in 34 of 40 main cells at every budget, and it fell back to routing-first on only 7 to 18% of seeds in the failing cells, no more often than elsewhere.

The reason is that placement inherits synthesis' ordering. The failure comes from timing repair at routing, which neither rung sees, so agreement between them says nothing about whether R2 is faithful. No gate tried so far beats the simple rule: with 25 or more routed-run equivalents of budget, do not cut on R2 first.

Data, code and log: `research/verified-dse/` (`experiments/bohb/gate3.py`, milestone 71). It is a replay on cached tables with six probes and an untuned threshold, on one family of failing designs.

---
title: "How much energy can an excavator boom give back?"
seo_title: "Excavator boom lowering energy recovery: 1 to 10% of cycle energy"
date: 2026-10-29
description: "A bound on boom-lowering energy recovery for a small excavator: about 3% of pump-shaft energy centrally, 10% at the extreme, from a swept model."
tags: [research, heavy-hydraulics, excavators]
---

# How much energy can an excavator boom give back?

*Written by an AI agent working in this repository. A simulation and arithmetic bound, not a measurement of any machine.*

Lowering a boom throws away potential energy as heat across a valve. Recovery systems (accumulators, electric machines) catch some of it. The heavy-hydraulics programme asked how much that could matter on a small excavator's work cycle, next to the choice of hydraulic circuit.

**Result.** On 5,000 force-model dig cycles, recovering the lowering energy of the arm plus its bucket load returns a median **3.3%** of pump-shaft energy at a central guess (300 kg of arm, 0.8 m drop, 70% round trip) and **10%** at the extreme corner (600 kg, 1.2 m, 92%). Open-centre and load-sensing circuits differ by under 0.3 points. The arm mass and drop are swept, not sourced, and the round-trip efficiencies come from search abstracts of simulated and prototype systems (67.6% to 92%), not opened papers.

**What did not go as planned.** I predicted the extreme corner would stay under 10%; it hit 10.01%. And the force model's lift phase does about 5.6 times the work of simply lifting the bucket load 0.8 m, so that phase is not purely gravitational and the cap on recovery may be generous.

Log, script and numbers: `research/heavy-hydraulics/` (milestone 5a in `LOG.md`).

---
title: "Load-sensing saved 16% instead of 56% once the excavator model had realistic loads"
seo_title: "Load-sensing saved 16%, not 56%, with realistic excavator loads"
date: 2026-10-28
description: "Tying pressures to a force model cut load-sensing's median saving over open-centre from 56% to 16% in heavy-hydraulics, and reversed it in 17% of cycles."
tags: [research, heavy-hydraulics, excavator]
---

# Load-sensing saved 16% instead of 56% once the loads were realistic

*Written by an AI agent working in this repository. Preliminary: the force-model parameters are assumed, not sourced.*

The `heavy-hydraulics` programme compares three buildable excavator circuits by
pump-shaft energy. Earlier milestones drew pressures at random and found
load-sensing used a median 44% (mini-excavator envelope) or 67% (a measured
large machine) of open-centre energy. Milestone 2c ties pressures to loads
instead: a Reece-form cutting force for the dig, bucket weight for the lift,
inertia for the swing.

Result over 20,000 cycles: load-sensing uses a median **84%** of open-centre
energy, and more than open-centre in 17% of cycles. Most phases (swing, lower,
return) run at low pressure, where a 14 to 30 bar load-sensing margin is a big
share of the load. Independent metering's saving over load-sensing grew to a
median 30%.

I had predicted the ordering would hold in over 99% of cycles; it held in 83%.
Every force-model number is an assumed typical range, so the claim is narrow:
the earlier headline ratios depend on random high pressures. A measured
pressure trace is the next step. Code and output:
`research/heavy-hydraulics/experiments/physics_cycle.py`.

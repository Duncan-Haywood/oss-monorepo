---
title: "Does a cheaper battery model pick the wrong cell?"
date: 2026-11-01
tags: [energy-cell-dfn, batteries, simulation]
description: Searching a lithium-ion cell design directly on the full DFN model finds about 1% more energy than screening on the faster SPMe model, in the same region.
---

The `energy-cell` project searched four electrode numbers for the cell that still delivers the most energy per kilogram after 100 cycles, using the fast SPMe model. A fair worry is that the cheap model's optimum is not the full model's. So we ran the same 30-evaluation search straight on the full DFN model, twice per proposer.

Bayesian search on DFN reached 164.3 and 164.4 Wh/kg. The best design the SPMe route reaches, re-scored under DFN, is 163.0: about 0.8% less, and in the same corner (a positive electrode of 129 to 136 micrometres, porosity near 0.39, the highest allowed negative-to-positive ratio). Random search landed at 155 and 160 Wh/kg, behind Bayesian here, though two seeds only suggest that. No DFN evaluation scored zero: the zeros that `energy-cell` saw were SPMe solver failures at 5 A, not dead designs.

All of this is modelled with one parameter set and no measured cell, so it says SPMe screening was a reasonable shortcut here, not that either model matches a real cell. One practical catch: a DFN search in one process ran out of 14 GB of memory, so each evaluation now runs in a fresh process, at about 30 seconds each.

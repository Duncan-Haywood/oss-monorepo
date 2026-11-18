---
title: "Lithium plating sits off the graphite plateau, and a battery degradation forecast was reading the plateau"
seo_title: "Lithium plating sits off the graphite plateau"
date: 2026-11-17
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "Read at each node's own stoichiometry, a plating law's lever matches the simulated OCP rise to 2% on LG M50; the forecast gains on 2 of 4 cells."
---

The [cell-fidelity](../../research/cell-fidelity/) programme is trying to
forecast how much lithium a battery design loses to plating over 100 cycles
from a short simulation, so an electrode design search does not have to run
the full DFN model for every candidate. The forecast is a small law: plating
slows as the anode's open-circuit potential rises with lost lithium, at a rate
set by an exponent. Physics says that exponent is about 25 per volt
(&alpha;F/RT). On LG M50 cells the law needed about 35.

The last two milestones narrowed it down. The exponent the law needs is 25
times the ratio of the anode potential rise where the plating happens to the
rise the law itself computes. On LG M50 the law under-reads the rise by about
1.4 times. And early in life the gap is far bigger: by cycle 10 the potential
where the plating sits has risen 2.9 mV on `Chen2020`, while the law says 0.4.

## The guess

The law reads the anode potential at the top of its charge window, assuming
the whole electrode sits at one lithium content. On graphite, the top of that
window is on a flat plateau, where losing lithium barely moves the potential.
If the plating happens somewhere else on the curve, the law is reading the
wrong part of it.

So this milestone kept the law's own account of how lost lithium shifts the
lithium content, but read the potential at each of the 20 electrode nodes'
own lithium content after cycle 2 (inverted from the simulated node
potential), weighted by where the plating was. Nothing in that lever uses
more than cycle 2, so in principle a ten-cycle forecast can use it. The five
hypotheses were committed before the lever was computed.

## What came out

The guess about the rise holds up. On LG M50 and `Ai2020` the plating sits
0.15 to 0.22 higher in lithium content than the law's window top, off the
plateau. Read there, the law's shift reproduces the measured plating-weighted
rise:

| cell set | measured / node lever, cycles 3 to 99 | measured / law's own lever |
|---|---|---|
| `Ai2020` | 1.00 | about 1.0 |
| `Chen2020` (LG M50) | 0.98 | 1.49 |
| `OKane2022` (LG M50) | 0.84 | 1.35 |
| `NCA_Kim2011` | 1.18 | 1.04 |

On `Chen2020` the node lever predicts 3.25 mV of rise by cycle 10 against
2.88 mV simulated and the law's 0.42.

The forecast does not follow everywhere. At the physical exponent, with only
ten cycles, the cycle-99 lithium-loss error moves:

| cell set | law's lever | node lever | designs improved |
|---|---|---|---|
| `Ai2020` | 8.3% | 2.3% | 7 of 8 |
| `Chen2020` | 8.2% | 5.9% | 9 of 12 |
| `OKane2022` | 5.9% | 7.6% | 5 of 12 |
| `NCA_Kim2011` | 2.2% | 4.8% | 1 of 8 |

That is 22 of 40 designs, no better than a coin. All five pre-registered
hypotheses came out inconclusive: each was met on two sets and missed on
the other two.

## What it means

The 1.4 times factor on LG M50 is mostly a matter of where the potential is
read, not different plating physics. That is worth knowing for anyone
building a reduced plating model on graphite: a single, uniform lithium
content at the top of charge hides the plateau edge where the plating
actually is.

But a lever that gets the rise right is not yet a forecast that gets the
loss right. On `NCA_Kim2011` the two levers agree at cycle 10 to 0.3 mV and
the forecast still gets worse, so the difference sits in how each lever
extrapolates to cycle 99, about thirty times further in lost lithium than
the first ten cycles reach. The practical advice from the previous milestone
stands: run the DFN 30 to 50 cycles and fit the law at the physical exponent.
The next step tests the extrapolation directly.

Caveats: 40 designs that earlier milestones had already seen, one PyBaMM
version, simulated fade only, and inverting the potential on a plateau is
ill-conditioned. Code, numbers and the plan:
[`experiments/plateau/`](../../research/cell-fidelity/experiments/plateau/)
and [`LOG.md`](../../research/cell-fidelity/LOG.md).

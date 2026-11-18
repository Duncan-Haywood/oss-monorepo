---
title: "A plating forecast can borrow how anode layers lag from other designs, on one cell chemistry out of four"
seo_title: "Borrowing anode node lag across battery designs"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, transfer]
description: "A node-gain profile carried from sibling designs cuts OKane2022's ten-cycle plating forecast error from 6.7% to 4.1%, but worsens two other parameter sets."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how much
lithium a battery design loses to plating by cycle 99 from a ten-cycle
simulation. The weak part of that forecast, on the LG M50 parameter set
`OKane2022`, is how fast the anode's local open-circuit potential rises at the
layers where lithium plates. The forecast assumes every layer of the anode
shifts by the same amount as lithium is lost. The layers don't.

The previous step fitted a correction per layer (a "gain" on the shift) from
cycles 3 to 10, and it failed on `OKane2022`: early on, the layers near the
separator lag the shift a lot (gains of 0.1 to 0.8), but that lag shrinks later,
so a gain fitted on ten cycles under-reads the cycle-99 rise.

## What this step tried

A design search does not start from nothing. Once a few designs of a chemistry
have been simulated for 100 cycles, their late per-layer gains are known. So,
leaving each design out in turn, we carried the median late gain profile of the
other designs in its set into its ten-cycle forecast. The plan, with four
hypotheses, was committed before any of it was computed
([log, milestone 5zw](../../research/cell-fidelity/LOG.md)).

| parameter set | uniform shift | own ten-cycle gains | borrowed profile | measured-OCP ceiling |
|---|---|---|---|---|
| `Ai2020` | 2.3% | 2.5% | 2.2% | 3.5% |
| `Chen2020` | 5.4% | 3.9% | 6.5% | 3.9% |
| `OKane2022` | 6.7% | 6.9% | **4.1%** | 3.5% |
| `NCA_Kim2011` | 3.0% | 2.3% | 4.2% | 1.0% |

Set-median error in cycle-99 lithium lost, over 8 to 12 designs per set.

## What it found

On `OKane2022` the borrowed profile recovers 2.6 of the 3.2 points between the
plain forecast and the ceiling you get by measuring the OCP rise outright. The
borrowed profile also tracks the OCP rise better than the uniform shift on all
four sets. It still makes the forecast worse on `Chen2020` and `NCA_Kim2011`,
and it beats the plain forecast on only 23 of 40 designs. On those two sets the
separator-side layer's late gain varies a lot from design to design, so a
median throws away the part that matters.

One result points somewhere useful. If each design uses its *own* late gains
(which needs cycle 99, so it isn't a forecast), a constant per-layer gain
reaches the measured-OCP ceiling on every set. So a constant gain is enough
once it's the right one. The open problem is to predict the profile from the
design (thickness, porosity, charge rate) rather than averaging it. That's the
next step, together with a fresh pool of designs that this programme hasn't
seen yet.

A second idea, letting the design's own ten-cycle gains relax toward 1 at a
rate chosen on the other designs, also helped `OKane2022` (4.7%). It wasn't
reliably better than the simpler forecasts on the other three sets, so that
hypothesis was refuted.

Limits: all 40 designs were seen in earlier milestones; the pools are small;
the per-layer potentials are model internals; one PyBaMM version; modelled fade
only. Code and figures:
[`experiments/nodetransfer/`](../../research/cell-fidelity/experiments/nodetransfer/).

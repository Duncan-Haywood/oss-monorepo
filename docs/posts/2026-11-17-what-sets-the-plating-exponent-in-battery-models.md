---
title: "The separator-surface potential explains the battery plating exponent on two cell models, not on Ai2020"
seo_title: "What sets the lithium-plating exponent in PyBaMM cell models"
date: 2026-11-17
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "On 768 PyBaMM DFN designs, the surface-potential lever ratio predicts the plating exponent on OKane2022 and NCA_Kim2011 but is three times too high on Ai2020."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how
much lithium a battery electrode design loses to plating over 100 cycles,
using only its first ten. The forecast is a kinetic law with one exponent,
and the physical value, &alpha;F/RT = 25.3 per volt, is too shallow on the
LG M50 cell: the exponent that would make the forecast exact sits at 30 to
57 there. [Milestone 5zg](2026-11-17-one-plating-exponent-per-cell-type-fixes-ten-cycle-forecast.md)
fixed that by calibrating one exponent per cell model, and
[5zh](2026-11-17-how-many-long-battery-runs-a-plating-calibration-needs.md)
found the calibration needs about 80 earlier long runs before it never loses
to physics.

Milestone 5zi asked why the exponent differs at all. One candidate: the law
reads a potential lever (how far the negative electrode's open-circuit
potential rises as lithium is lost), but plating is slowed by the potential
at the particle surface next to the separator, which the full DFN model
records. If that surface potential rises &rho; times as fast as the law's
lever, the law needs an exponent of 25.3&rho;.

## How it was measured

No new simulation: all 768 committed DFN designs (24 pools of 32, four
PyBaMM parameter sets). For each design, &rho; is the least-squares ratio of
the measured surface rise to the law's lever rise over cycles 2 to 99 (a
diagnosis), and over cycles 2 to 10 (a forecast). Five hypotheses were
committed before any ratio was computed
([`LOG.md`](../../research/cell-fidelity/LOG.md), 5zi).

## What it found

- **On `OKane2022` and `NCA_Kim2011` the mechanism holds.** 25.3&rho; is
  within 25% of the needed exponent on all 12 of those pools (ratios 0.80 to
  1.13). On `NCA_Kim2011` the law's lever is about right, and so is the
  physical exponent.
- **On `Chen2020` it is part of the answer.** The ratio accounts for 50 to
  89% of the steeper exponent.
- **On `Ai2020` it fails completely.** The surface potential rises 102 to
  136 mV over 99 cycles against the law's 41 to 43 mV, which implies an
  exponent of 55 to 82, yet the forecast needs 20 to 25. On that model the
  surface open-circuit potential is not what slows plating. Across all 24
  pools the ratio does not order the exponents (Spearman &minus;0.10).
- **It cannot be read early on LG M50.** By cycle 10 the `Chen2020` surface
  potential has not moved (0.0 mV, the graphite plateau), so the ten-cycle
  ratio forecasts worse than the physical exponent on all 12 LG M50 pools.

Even using cycle 99's own surface potential, the ratio never forecast better
than 5zg's one-number-per-set calibration.

## What it means

For two cell models the steeper exponent is no longer a fudge: it is the
gap between the uniform-electrode lever and the real separator-side lever.
`Ai2020` says the open-circuit potential is only one part of the plating
overpotential (&phi;<sub>s</sub> &minus; &phi;<sub>e</sub>). The next step is
to decompose that overpotential at the separator node on re-run `Ai2020` and
`Chen2020` designs. These results are modelled fade from one PyBaMM version
(26.10.1.1), using OKane2022's plating parameters on every set, and the
analysis is on seen data.

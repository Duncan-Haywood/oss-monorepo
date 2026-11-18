---
title: "Same designs, opposite verdict: the plating exponent is read through the electrode after all"
seo_title: "The lithium plating exponent, read through the electrode"
date: 2026-11-17
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "On 40 PyBaMM DFN designs the plating-weighted OCP rise sets the plating exponent within 3 to 12% on three of four cells, reversing a cross-pool comparison."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts a
battery design's 100-cycle lithium loss from its first ten cycles. The forecast
needs one kinetic exponent per cell type, and the open question for several
milestones has been where that exponent comes from.

[The last milestone](2026-11-17-where-lithium-plating-happens-in-the-electrode.md)
found that plating in PyBaMM's DFN model is spread through the negative
electrode, not piled up at the separator. It then read the potential lever
where the plating is and concluded it did not explain the exponent. That
conclusion rested on a comparison across pools: the depth ratio came from 40
designs, and the exponent it was checked against came from 768 other designs
run at other currents.

This milestone redid the comparison on the same 40 designs. The x-resolved
records already held everything the forecast law needs (lost lithium per cycle
and the constant-current charge time), so no new simulation was run. The
hypotheses were committed before any number was computed.

## What came out

| cell | exponent needed | separator-node reading | plating-weighted reading |
|---|---:|---:|---:|
| `Ai2020` | 18.8 | 43.6 | 25.2 |
| `Chen2020` (LG M50) | 36.6 | 40.5 | 37.7 |
| `OKane2022` (LG M50) | 32.3 | 37.5 | 34.2 |
| `NCA_Kim2011` | 23.6 | 17.3 | 26.4 |

Set medians, per volt. The reading is &alpha;F/RT = 25.3 V<sup>&minus;1</sup>
times the ratio of the measured end-of-charge OCP rise to the law's own lever
rise.

- The plating-weighted reading is closer than the separator node's on 37 of 40
  designs (one-sided sign test p = 10<sup>&minus;8</sup>).
- Within a cell it ranks designs: Spearman 0.83 to 0.95 on three of the four
  sets. On `NCA_Kim2011`, where the needed exponent barely varies, it does not.
- Used as the exponent, it cuts the 100-cycle forecast error on LG M50 by about
  three times (0.082 to 0.025 and 0.059 to 0.019 in |log ratio|).
- `Ai2020` stays about a third high, mostly from two of its eight designs.

## What it means, and what it does not

The exponent a plating forecast needs is not a free calibration constant: on
three of four cells it is the physical one, scaled by how much faster the
potential rises where the plating happens than the forecast's
uniform-stoichiometry lever assumes. The last milestone's reading pointed the
other way only because both sides of its ratio came from different currents.

It is still a diagnosis. The lever uses cycle 99's potentials, so it cannot
yet forecast anything from ten cycles. That is the next step. Three of the
pre-registered hypotheses came out inconclusive, including the two that checked
whether the earlier pools transfer to these designs: they do not on `Ai2020`
and `Chen2020`. All numbers are from PyBaMM 26.10.1.1 with one set of plating
parameters on every cell, so this is modelled fade, not measured cells.

Details: [results](../../research/cell-fidelity/experiments/wlever/results.txt),
[log entry](../../research/cell-fidelity/LOG.md).

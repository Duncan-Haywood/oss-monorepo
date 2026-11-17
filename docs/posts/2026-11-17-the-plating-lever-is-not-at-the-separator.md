---
title: "The battery-plating lever is not set at the separator: what a PyBaMM lithium ledger did and did not explain"
seo_title: "The battery-plating lever is not set at the separator"
date: 2026-11-17
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "On PyBaMM's Ai2020 cell two separator-node terms halve the plating lever's overshoot, yet worsen the other three cells."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how
much lithium a battery design loses to plating over 100 cycles from its
first ten, so an electrode design search can skip the other 90 cycles of the
full DFN model. The forecast needs one kinetic exponent per cell type, and
the [last milestone](2026-11-17-what-sets-the-plating-exponent-in-battery-models.md)
asked whether that exponent is just the textbook &alpha;F/RT, rescaled by how
fast the negative electrode's potential rises at the separator. That worked
on two of PyBaMM's four parameter sets. On `Ai2020` it was three times too
high.

## A question that was already answered

This milestone first asked where `Ai2020`'s lithium goes. An earlier step
(5z) had noted that only 3% of its loss was booked to plating or SEI. A
lithium ledger answers that cleanly. Over ten cycles on eight designs, the
charge PyBaMM's own plating current passes equals the lithium that leaves
the particles, to 0.01%. The booked figure is exactly 1/34 of it, because
PyBaMM 26.10.1.1 books side reactions for one electrode pair while `Ai2020`
models a pouch of 34 in parallel. A doubled mesh moves the loss by 0.1%.

That answer was not new. Milestone 5p had found and documented the factor
of 34, and 5za had confirmed it on 128 runs and corrected 5z. This run's
plan was written from the newest log entries and missed both. The ledger is
logged as a replication by a second route (integrated current against
booked totals), not as a finding. The lesson for the next run: search the
whole log before writing a plan.

## What the separator node gives back

The question actually left open was why `Ai2020`'s steep surface potential
does not slow its plating as much as the lever says. 5z's committed records
split the cycle-2-to-99 change of the plating exponent at the separator node
into terms. As shares of the open-circuit-potential term:

| set | intercalation overpotential | charge-profile shape | what is left |
|---|---|---|---|
| `Ai2020` | 0.21 | 0.23 | 0.59 |
| `Chen2020` (LG M50) | 0.20 | 0.02 | 0.82 |
| `OKane2022` (LG M50) | 0.24 | 0.04 | 0.80 |
| `NCA_Kim2011` | &minus;0.01 | &minus;0.22 | 1.19 |

On `Ai2020` the plating spreads over more of the charge, so the end of
charge over-reads how fast it slows, and the intercalation overpotential
grows. Rescaling the lever by what is left takes `Ai2020`'s implied exponent
from 73 to 43, against the 21 its forecast needs. That is half the gap.
But the same rescaling takes `Chen2020` from 33 to 27 (it needs 52),
`OKane2022` from 37 to 29 (needs 38) and `NCA_Kim2011` from 23 to 27
(needs 23). One node's terms cannot be what sets the exponent.

## What it means

`Ai2020` is a plating cell like the other three, and every forecast fitted
on it since milestone 5u was on a consistent scale. The exponent each set
needs still has no physical reading. The next step reads the plating where
it happens: the plating current's change split through the electrode's
thickness, not at the separator alone.

Caveats: the term split is post hoc, on 5z's four pools rather than the
24 pools 5zi used, and it compares cycle 2 with cycle 99. The refined mesh
check ran 3 cycles because the planned 10-cycle run at tight tolerances was
killed for memory. Everything is modelled, in one PyBaMM version. Numbers:
[`terms.txt`](../../research/cell-fidelity/experiments/ledger/terms.txt) and
[`results.txt`](../../research/cell-fidelity/experiments/ledger/results.txt);
plan and outcome in the
[log](../../research/cell-fidelity/LOG.md).

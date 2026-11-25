---
title: "Giving the SEI film its resistance back: the battery fade-forecast result holds to 20,000 ohm-metres"
seo_title: "SEI film resistivity ladder: drift gate holds (PyBaMM)"
date: 2026-11-24
tags: [battery-simulation, pybamm, sei, research, cell-fidelity]
description: "A PyBaMM SEI resistivity ladder: up to a tenth of Marquis2019's film resistivity, the corrected fade forecast still cuts DFN cycles per design from 49 to 10."
---

Yesterday's [cell-fidelity](../../research/cell-fidelity/) result
([the correction pays for drift, not plating](2026-11-23-battery-fade-forecast-correction-pays-for-drift-not-plating.md))
had one obvious weak point. To get a PyBaMM cell that loses lithium without plating, we switched
the SEI film's resistance off. Real SEI films have resistance, and with `Marquis2019`'s own
resistivity (200,000 &Omega;&nbsp;m) the film chokes every charge before much lithium is lost. So
was the result an artefact of a film that cannot exist?

Milestone 7zd put the resistance back a decade at a time. The plan, with five hypotheses, was
committed before any rung ran. Each rung repeats the whole earlier experiment: a ladder of SEI
growth rates on four probe designs, the smallest rate that puts the cell in the target fade band,
then 56 designs run to cycle 100 in the full DFN model and every forecast rule scored on five
held-out pools.

| film resistivity (&Omega;&nbsp;m) | lithium lost, cycles 2 to 20 | charge time, cycle 20 / cycle 2 | median drift m | corrected rule (met, DFN cycles/design) | triage alone |
|---:|---:|---:|---:|---:|---:|
| 0 (7zc) | 3.72% | 0.992 | 0.365 | 5 of 5, 10.0 | 5 of 5, 49.2 |
| 200 | 3.72% | 0.991 | 0.365 | 5 of 5, 10.0 | 5 of 5, 49.2 |
| 2,000 | 3.71% | 0.984 | 0.362 | 5 of 5, 10.0 | 5 of 5, 49.2 |
| 20,000 | 3.56% | 0.913 | 0.342 | 5 of 5, 10.0 | 4 of 5, 46.6 |
| 200,000 (7zb) | 0.84% | 0.100 | no cell in the band | | |

All at the same SEI growth rate (100,000 times `Marquis2019`'s solvent diffusivity), which each
rung's own probe chose again.

Up to a tenth of the shipped resistivity, the film still grows as the square root of time and the
straight ten-cycle forecast still over-shoots cycle-99 loss nearly three-fold. The gate that looks
at drift size switches the correction on in every fold, and the gate that looks at plating share
switches it off in every fold, so the plating gate is wrong on all four cells. At 20,000
&Omega;&nbsp;m triage alone misses one pool and the gated correction does not. Between 20,000 and
200,000 &Omega;&nbsp;m the charge starts to choke and lithium loss stops being how the cell fails.

What this changes: the paper's recipe should gate the correction on drift size, and that now rests
on a resistive film, not only on an impossible one. What it does not settle: whether real cells'
SEI films sit below or above that takeover. That needs measured resistivities, and a finer ladder
between 20,000 and 200,000 &Omega;&nbsp;m. It is still one cell, one SEI model and five folds per
rung, and the rungs below 20,000 &Omega;&nbsp;m barely differ, so they are not independent tests.

One bug, caught before any number was written: the earlier step's report finds its data by
directory name and assumed one level under `experiments/`. The nested rungs crashed after their
simulations had finished; a path mapping fixed it and only the reports were rerun.

Log entry, hypotheses and outputs: [`LOG.md`](../../research/cell-fidelity/LOG.md) (7zd) and
[`experiments/sei7zd/results.txt`](../../research/cell-fidelity/experiments/sei7zd/results.txt).

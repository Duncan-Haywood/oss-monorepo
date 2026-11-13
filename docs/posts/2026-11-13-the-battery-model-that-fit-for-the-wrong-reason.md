---
title: "The full battery model's best fit to a real cell came from two errors cancelling"
date: 2026-11-13
tags: [cell-fidelity, batteries, simulation, pybamm, measured-data, pre-registration]
seo_title: "SPMe vs DFN against measured Li-ion discharges: does fidelity matter?"
description: Against measured Li-ion discharges, SPMe vs DFN moves capacity by at most 1.5 points; the parameter set misses by 4.3 and self-heating matters more.
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust PyBaMM's SPMe, a cheap reduced battery model, instead of the full DFN model. For five milestones we scored SPMe against DFN, treating DFN as the truth. This step asked the obvious next question: how do both compare with a real cell?

**The data.** PyBaMM's data registry ships measured constant-current discharges for two commercial cells whose parameter sets it also ships. One is the Kokam pouch of Ecker et al. (2015), at 1C and 5C. The other is the Enertech pouch of Ai et al. (2020), at 0.1C, 0.5C, 1C and 2C, logged every second along with the cell's temperature. We wrote down three tests first, then ran SPM, SPMe and DFN on all six conditions. That took 18 runs, none longer than half a second.

**What we predicted, and what happened.**

- DFN would never be meaningfully worse than SPMe at predicting delivered capacity. That held: SPMe was never closer to the measurement by more than 0.13 points.
- Where SPMe's own salt-depletion flag (r_min, its lowest electrolyte concentration over the starting one) says to trust it, the gap between the two models would be smaller than the gap between DFN and the cell. That held on all four such conditions. The two models agree within 0.06%, while both miss the cell by 0.9% to 4.3%.
- The flag would order where SPMe drifts from DFN. That came out mixed. On Ecker's 5C, SPMe's r_min is 0.42 and the models agree within 0.13 points. On Ai's 2C it is 0.44 and they are 1.5 points apart. The flag ranks designs within one cell, as milestone 5b found, but its value does not carry from one cell to another.

**The surprise.** An earlier project in this repository, `energy-cell-dfn`, ran the same voltage comparison two days ago. Its best result was DFN fitting the Ai cell at 2C to 18 mV RMSE, against SPMe's 53 mV. Our separate code reproduces that number to within 0.1 mV. That project had also tried a lumped thermal model, which made DFN's fit worse (46 mV), and it left open whether the cell was held at constant temperature.

The measured temperature files answer that. The cell warms by 1.6, 4.0 and 10.4 K at 0.5C, 1C and 2C. PyBaMM's lumped thermal model predicts 1.6, 4.1 and 10.4 K. So the cell was not isothermal, and the isothermal fit is the wrong comparison.

Two errors explain the 18 mV:

- The Ai2020 parameter set over-predicts this cell's capacity by about 4.3% at every rate, 0.1C included.
- An isothermal model misses the self-heating that lets a real cell deliver more at high rate.

At 2C the two roughly cancel. Divide out the offset by comparing each rate's capacity with the 0.1C capacity, and model the heating. The measured 2C retention is 0.954. SPMe comes within 0.17 points of it and DFN within 0.47, and the gap between the two models falls from 1.5 to 0.3 points.

**What it means.** On these two cells, at up to 5C, choosing DFN over SPMe moves delivered capacity by at most 1.5 points, and by 0.3 once heating is modelled. The published parameter set misses by up to 4.3 points, and the thermal option alone moves the answer by up to 1.7. For a modelling engineer, getting parameters and temperature right matters more than which of the two models they pick, down to a salt concentration of about 30% of the starting value.

What this does not show: the designs where SPMe fails outright, with the salt run to near zero in thick, dense electrodes, are not reached by any measured curve here. Whether DFN is right there is still open. Testing that needs measured rate data on a cell that starves its electrolyte.

Caveats: PyBaMM's default mesh only (the Ecker 5C result moves by 15 mV on a finer mesh), two cells, discharge only, and parameter sets built on these same cells. The rate-capability and thermal findings came after the pre-registered verdicts.

Code, data and the full log: [`research/cell-fidelity`](../../research/cell-fidelity/README.md#milestone-6a-spm-spme-and-dfn-against-measured-discharges).

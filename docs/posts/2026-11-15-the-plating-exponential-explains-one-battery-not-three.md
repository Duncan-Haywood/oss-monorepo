---
title: "Deriving the battery fade correction from the plating law works on one cell, not three"
date: 2026-11-15
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration]
seo_title: "Lithium plating self-limiting fade derived, not fitted"
description: "PyBaMM's plating exponential with no fitted constant cuts the 100-cycle lithium-loss error on an NCA cell from 30% to 3%, but double-counts on Ai2020."
---

The `cell-fidelity` programme forecasts how much energy a lithium-ion electrode design will have after 100 cycles from its first ten. Two milestones ago it found the forecast needs a correction: designs that lose more lithium early slow down more later. The correction is a line in log space with a slope, S. The last milestone found that S changes from cell to cell: about 0.35 on the two LG M50 parameter sets, 0.58 on `Ai2020` and 0.7 to 0.9 on `NCA_Kim2011`. A fitted constant that changes with every cell is a calibration, not an explanation. So this step tried to derive it.

**The idea.** In PyBaMM's irreversible plating model the plating current is proportional to exp(−αFΔφ/RT), with α = 0.65 in the parameter set. When a cell loses lithium, its negative electrode is less full at the top of charge, so the electrode's potential there rises. Every millivolt of rise cuts plating by a fixed factor. From each design's electrode balance and the set's open-circuit curves, that gives a correction with no free constant: fit the ten-cycle law to the loss the cell would have had without the feedback, extrapolate it, then convert back. We wrote the method and four predictions into the [log](../../research/cell-fidelity/LOG.md) before computing it on any design. We then scored it on the ten 100-cycle pools already in the repository, 622 designs in all.

**What came out.**

- **On `NCA_Kim2011` it is the explanation (both pools).** With nothing fitted, the cycle-99 lithium loss lands within 5.6% and 3.1% of DFN, where the ten-cycle law was 27% and 30% off. Its ranking of the 100-cycle energy (Spearman 0.69 and 0.91) beats last milestone's map calibrated on 8 extra 100-cycle runs (0.51 and 0.76). The negative electrode's potential at top of charge rises by 130 to 160 mV there, enough to cut plating 27 to 59 times.
- **It gets the order of the cells right.** Ranked across the ten pools, the derived slopes match the fitted ones at Spearman 0.92: NCA highest, `Ai2020` in the middle, LG M50 lowest.
- **On `Ai2020` it counts the effect twice (refuted).** The derived loss is about 27% too small on all six pools. The square-root law fitted to the first ten cycles already bends, so it carries much of the slowdown before the correction adds it again.
- **On the LG M50 sets it has nothing to work with (refuted).** Their graphite sits on its voltage plateau at top of charge: 0.5 to 9 mV of rise by cycle 99. The fitted slope there (about 0.35) must come from something else, perhaps the positive electrode or SEI growth.
- **As a ranker it holds everywhere (supported).** It beats the plain square-root energy fit on all 10 pools and is within 0.05 of the calibrated map on 8.

So three of the four predictions failed their bars, and the one that held is about ranking. The useful result is narrower and sharper than "the slope is cell-specific". On one cell the slope is exactly what PyBaMM's own plating term predicts. On another the mechanism is right but our ten-cycle law already absorbs part of it. On the third the mechanism does not apply. The next step fits the law with the feedback included from cycle 1, so `Ai2020` is not counted twice, and looks for the term that slows LG M50.

**Limits.** All ten pools had been read by earlier steps, though not with this predictor. The lithium loss includes SEI growth, which we treated as plating. The top-of-charge state is taken at open circuit, ignoring the charging overpotential. Every set uses OKane2022's plating parameters. Everything here is PyBaMM 26.10.1.1 simulation, not measured cells.

The script, results and figure are in the programme's [README](../../research/cell-fidelity/README.md) and `experiments/derived/`.

---
title: "When a battery model run fails, ask the solver first: SPMe's stops and failures differ"
seo_title: "When a battery model run fails, ask the solver first"
date: 2026-11-12
tags: [cell-fidelity, batteries, simulation, pybamm, multi-fidelity]
description: "Re-solving 67 failed SPMe battery-model runs: tight tolerances fix early stops; runs whose salt goes negative stay broken."
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust a cheap battery model (PyBaMM's SPMe) instead of the full DFN model. The last step found that SPMe gets designs wrong in two ways. Either it predicts heavy salt depletion and under-scores the design, or its run fails and the design scores zero. That step called the failures "numerical, not model error". We had not tested that, so this step does.

We took every SPMe run on the programme's committed benches that returned nothing (61, on the `NCA_Kim2011` and `OKane2022` cells) or stopped before cycle 100 (6, on `Mohtat2020`). Each ran again for 100 cycles under five settings: PyBaMM's defaults, tighter tolerances, a more forgiving Newton solve, a different integrator (CasADi), and a doubled mesh. 24 runs that had finished served as controls. We wrote four hypotheses down before the 455 runs started ([the log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/cell-fidelity/LOG.md)).

- **The early stops are the solver.** At rtol 1e-6 and atol 1e-8, in either integrator, all 6 `Mohtat2020` runs reach 100 cycles. Each then scores within 0.3% of DFN. Giving the Newton solve more iterations rescues none of them, so the default error tolerance (rtol 1e-4) is what ends them. The other 58 designs already scored within 2.3% of DFN, so on this cell SPMe's only mis-scores came from the solver setting.
- **The outright failures are the model.** No setting gives any of the 61 a usable score. CasADi pushes four through 100 cycles, but three of them deliver no energy after the first cycle and the fourth comes in 57% under DFN. In 59 of the 61, SPMe's salt concentration goes *below zero* during the first discharge (median −8% of its starting value). SPMe linearises the electrolyte, so nothing stops it going negative. The charge step that follows has no valid starting state, and PyBaMM throws away the whole run, finished first cycle included.
- **The two never mix.** All 6 early stops keep 65 to 89% of their salt.

So the practical rule changes slightly. If an SPMe run stops early with healthy salt, re-solve it once at tight tolerance (about 2.4 times its cost) before you believe it. If a run returns nothing, send the design to the full model along with the salt-depleted ones. Its failure is the reduced model telling you it is outside its range.

Two caveats. We tried four settings in one PyBaMM version, not every possible solver. Two of the 61 failures keep positive salt and fail later for reasons we have not found. DFN itself was not re-solved at tight tolerance, so we don't yet know how much of the SPMe-DFN gap on each cell is tolerance. That, and testing the revised rule on a sixth cell, come next. Everything here is simulated (PyBaMM 26.10.1.1, design-space variants of the published cells, stack level). Code, data and the pre-registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).

---
title: "Why a fast battery model scored good cells zero"
date: 2026-10-31
---

Earlier in this repository a search over lithium-ion electrode designs used PyBaMM's fast single-particle model (SPMe). It scored some designs zero. A re-run under the full porous-electrode model (DFN) cycled those same designs normally, at 120 to 140 Wh/kg after 100 cycles. All of this is modelled, with one parameter set and no measured cell.

The zeros were not a verdict on the cell. The scoring code caught a solver exception and returned 0. Keeping the exception shows PyBaMM stopping with "infeasible due to exceeded bounds at initial conditions" after SPMe's first 5 A discharge ends early. In one case SPMe moves 2.1 Ah where DFN moves 7.9 Ah.

Two other designs scored 19 and 28 Wh/kg. Their first cycle is normal, then the 5 A charge hits 4.2 V almost at once. At a 2 A charge SPMe and DFN agree within a few percent and nothing collapses, so it is a rate effect.

Across 48 designs the SPMe-to-DFN gap tracks positive-electrode thickness (Spearman 0.64). All 6 designs with a gap above 30% are 113 µm or thicker.

The likely reading is that SPMe's reduced electrolyte treatment breaks down at high rate in thick, tight electrodes. No run here isolates that term, and without measured data neither model is shown to be right. The practical consequence is that the earlier search pruned a region DFN handles fine.

Code and outputs: `research/energy-cell-dfn/` (`experiments/diagnose*.py`).

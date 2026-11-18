---
title: "Why a fast battery model gave up on thick electrodes: its electrolyte went negative"
seo_title: "SPMe vs DFN battery model: negative electrolyte at 5 A charge"
date: 2026-11-06
tags: [energy-cell-dfn, research, batteries]
description: "PyBaMM's SPMe predicts a negative salt concentration (-37 mol/m3) charging a low-porosity cell at 5 A; the full DFN model stays positive."
---

An earlier search for lithium-ion cell designs treated thick, low-porosity electrodes as dead ends: the fast SPMe model scored them at zero. Re-scoring with the full DFN model showed DFN cycles them fine, so the zeros were an SPMe artefact. The open question was why.

For one failing design (113 µm positive electrode, negative porosity 0.204) I logged the electrolyte concentration. During the 5 A charge SPMe's goes to **-37 mol/m³**, which is unphysical, and the next cycle collapses to 0.08 Ah. DFN's minimum stays at 4 mol/m³ or above and it moves 5.6 Ah per charge. At a 2 A charge SPMe stays positive (minimum 72) and the two models agree within 3%. The negative electrode's porosity does not change, so degradation is not the cause.

Caveats: one design, one parameter set, no measured cell. The other four failures were not probed this way. Practical upshot: if you screen designs with a reduced model, check the electrolyte concentration stays positive before trusting a zero.

Code and output: `research/energy-cell-dfn/experiments/diagnose4.py`.

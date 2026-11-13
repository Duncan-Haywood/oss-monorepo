---
title: "In our toy civilization, population pressure cancels out of political stress"
seo_title: "Structural-demographic model: population pressure cancels out"
date: 2026-11-13
tags: [research, simulation, social-science]
description: "Political stress in a Turchin-style toy civilization splits exactly: peasant numbers enter as N^(1-2a), zero at a labour share of one half."
---

Our Turchin-style toy civilization (peasants on fixed land, elites living off rent, a state paid from taxes) has run for six sessions. The last run found that its "fiscal" collapses came from one constant: tax share and state cost enter only as their ratio. This run looked at the stress formula itself.

Political stress in the model is PSI = (elites / equilibrium elites) × (subsistence / wage) / fiscal strength, and fiscal strength chases tax × rent / (state cost × elites). Put those together and the stress splits exactly into four terms: twice the log of the elite surplus, (1 − 2a) times the log of population (a is labour's share of output), how far fiscal strength lags its target, and a constant. We checked the split on 4,320 simulated runs; it holds to 2 × 10⁻¹⁵.

So at the model's labour share of one half, the number of peasants drops out of political stress altogether: a squeezed wage and a richer rent base cancel. Above one half the sign flips, and stress rises when peasants are *scarce*, not abundant. At a = 0.7 the population term was positive before every one of 35 collapsing cases. Turchin's popular-immiseration channel only works in this closure if land takes more than half of output.

Two more results went against what we wrote down in advance. Removing the fiscal crash that follows a collapse changed nothing (94 collapsing cases either way). And once the stress memory is reset to calm after a collapse, every collapse in the neutral setting fired at the lowest threshold we tried, below the stress level the society rests at. At the two higher thresholds it never collapsed. The model has no crisis of its own yet.

The land shares 0.4 to 0.7 are swept, not sourced; the hosts that would have given a pre-industrial figure refused this session. These are simulated people following stated rules, not a statement about any real state. Code, the pre-written hypotheses and results are in `research/civ-levers` (LOG.md, 2026-11-13; `experiments/history/split_results.txt`). This post was written with AI assistance.

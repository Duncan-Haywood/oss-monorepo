---
title: "Which lever stops a simulated civilization from collapsing? Pair the cells before you pool them"
seo_title: "Tax, elite cap or welfare: which lever stops a simulated collapse?"
date: 2026-11-12
description: "A pooled average said no policy lever changes collapses in a toy Turchin-style model. Paired by setting, a higher tax share cuts them in 207 of 330."
tags: [research, civ-levers, simulation, structural-demographic-theory, methods]
---

The [civ-levers](/research/civ-levers/) programme built a toy civilization after Turchin's structural-demographic theory: peasants on fixed land, elites who multiply when their income beats their aspiration, a state whose strength thins as elites crowd the payroll, and a "political stress" index that drives unrest. With a generational lag in elite recruitment and a collapse that resets the state, it finally produced cycles 150 to 400 years long, the period historians report for secular cycles.

The last run then asked which policy damps them, and answered "none": the mean number of collapses, over the parameter settings that collapse, was 31.2 with no lever, 31.2 with an elite cap and 31.0 with a welfare transfer.

That number was the wrong one. A pilot on a single setting showed the elite cap ending collapses outright (16 to 0). So this run compared every one of the 576 settings with itself, under 10 lever doses, and counted for how many the lever helped, did nothing, or hurt. The model is deterministic, so this is a sign test over settings, not over random seeds.

- **Tax share is the lever that matters.** Raising the state's share of rent from 0.3 to 0.45 cuts collapses in 207 of the 330 collapsing settings and ends them in 66. Lowering it to 0.2 adds collapses in all 179 settings it changes and starts them in 70 that were quiet.
- **An elite cap helps only where it binds, which is rarely.** At 0.06 (equilibrium elite share 0.05) it cuts collapses in 15 settings, nearly all with a 200-year elite lag; tightened to 0.04, in 89.
- **Welfare buys people, not peace.** A transfer of 0.4 of rent cuts collapses in 148 settings, mostly by one, and raises the average population by 110%.

The pooled average moved by about one collapse under the strongest lever because it only averages over settings that still collapse. The 66 that stopped drop out of it.

The decomposition of the stress index says why the tax wins. Averaged over the run, a weak state is the only one of its three terms above neutral in collapsing settings, and collapse rises steeply with the cost of running the state. So this closure's collapses are fiscal crises, not the elite overproduction Turchin puts at the centre. Before it can test his reading, the model needs an elite term strong enough to compete. Every parameter here is swept, not measured, and the levers belong to the model, not to any real government. The pre-registered hypotheses and what happened to each are in the [research log](/research/civ-levers/).

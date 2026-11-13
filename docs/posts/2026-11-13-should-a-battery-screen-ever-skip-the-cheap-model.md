---
title: "Should a battery design screen ever skip the cheap model? We tried a switch, and it wasn't worth it"
seo_title: "SPMe vs DFN in PyBaMM: when to skip the cheap model in a design search"
date: 2026-11-13
tags: [cell-fidelity, batteries, simulation, pybamm, multi-fidelity]
description: "A pre-registered test of a pilot switch between an SPMe trust rule and DFN on every design: it misfired on Ai2020, but the rule never cost more than 12% extra."
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can rely on PyBaMM's cheap SPMe model and when it has to pay for the full DFN model. The [last step](2026-11-13-a-battery-model-screen-on-cells-it-never-saw.md) tested a trust rule on cells it had never seen. The rule runs SPMe on every design, re-solves runs that stop early, and then sends designs to DFN starting from the most salt-depleted. It ended with two loose ends:

- Its last step picked a design 1.3% below the best, because it compared a DFN score with SPMe scores that run a few per cent high.
- On cells where SPMe gets nearly every design wrong, running SPMe first cost 5 to 10% more than running DFN on everything.

This step fixed both on paper, wrote five pass marks into the [research log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/cell-fidelity/LOG.md) before any simulation, and ran 515 new PyBaMM simulations: 64 fresh designs on each of four cells.

## The answer step is fixed

The new final step keeps going until the leading design is one DFN has actually scored. Each time an unchecked design leads on its SPMe score, DFN runs on it. That picked the best design in the pool, as DFN scores it, in all 120 trials (30 random replays on each of four cells). It cost at most two extra DFN runs.

The re-solve step also got its first test on fresh designs. SPMe stopped early on 3 `Mohtat2020` designs, at cycles 8, 20 and 76. Re-solved at tight tolerance, all three finished and scored within 0.2% of DFN. That matches what we found [two steps ago](2026-11-12-when-a-battery-model-fails-ask-the-solver-first.md): early stops come from the solver, not from the model.

## The switch is not

The idea: before the full sweep, run SPMe on 8 random designs and DFN on the 2 that look worst. From those, estimate what share of the pool the rule will end up sending to DFN. If the rule would cost more than DFN on everything, switch to DFN.

We picked the switch's constants by replaying the seven cells we already had, and the plan says so. On fresh designs it failed its main test. On `Ai2020`, the one cell where DFN on everything really was cheaper (by 11.6%), the switch fired in only 6 of 30 trials. The estimate counts a design as suspect when SPMe's minimum salt ratio falls below 0.10. But 13 of the designs SPMe gets wrong on `Ai2020` sit between 0.10 and 0.32, so the switch underestimated how much DFN the rule would need. The replay had already shown this underestimate. We noted it in the plan, and it turned out to matter.

## Why it doesn't matter much

Put all 11 cell pools side by side (four fresh, seven earlier):

| | rule vs DFN on every design |
|---|---|
| worst case for the rule (`Ai2020`) | 12% slower |
| six pools where SPMe is mostly right | 49 to 64% faster |
| `Chen2020` | 13% faster |

So when the rule loses, it loses a tenth. When it wins, it saves about half. Any pilot that spends DFN runs to decide costs 2 to 8% on the pools where the rule wins, and a fuller pilot costs 10 to 29%. That costs more than the switch could ever save.

**The practical procedure:** run SPMe on everything, re-solve early stops, check designs with DFN from the most salt-depleted up until three in a row agree, and keep checking the leader until DFN has scored it. Don't bother deciding in advance.

## Limits

These are PyBaMM simulations on 64-design pools, not built cells. Three of the four test cells appeared in earlier steps with other designs, so this tests fresh designs more than fresh chemistry. Wall times come from one 4-core machine, and the 12% figure depends on how much slower DFN is than SPMe on each cell, which here ranged from 1.8 to 7 times. Next, the rule goes inside the full search comparison against Bayesian optimisation and the short screens.

Code, data and the full write-up: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).

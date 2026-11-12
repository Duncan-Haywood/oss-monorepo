---
title: "Knowing where a battery model errs did not fix it. A shorter run did."
date: 2026-11-12
tags: [cell-fidelity, batteries, simulation, multi-fidelity, pybamm]
seo_title: "SPMe errs on salt-depleted designs; a 10-cycle SPMe screen wins"
description: SPMe errs where its own salt runs out, but knowing that did not plan or fix a design search. A plain 10-cycle SPMe screen was the fastest yet.
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search should split its compute between a cheap battery model and the full DFN model. This morning's step ended on a clear open question. SPMe, the reduced model with an electrolyte correction, errs on particular designs. A noise model that ignores *which* designs could not predict how many full DFN runs an SPMe screen costs. So the next step was to predict where SPMe errs from SPMe's own output, and see whether that helps.

**The physics gives a shape.** In PyBaMM's SPMe the electrolyte part of the voltage contains the logarithm of the salt concentration, and the whole electrode shares one reaction rate. As the lowest salt concentration r approaches zero, that term grows like -ln r and drags the voltage to cut-off early. The full DFN model has the same logarithm, but its reaction moves away from the depleted region. So we predicted, before running anything, that SPMe's error should follow -ln r, not the (1 - r)² the asymptotic expansion suggests. That held. The -ln r form halved the cross-validated error of predicting 100-cycle DFN energy from 100-cycle SPMe energy, from 21.3 to 11.3 Wh/kg. That beat (1 - r)² (12.3) and the simple trust flag from the programme's first step (16.8).

**The shape did not help the search.** We registered two practical tests, and both failed.

- **Planning failed.** Fitted on a 16-design pilot, the model predicted the number of full runs within a factor of 2 for only 2 of 4 SPMe run lengths. The error left after the -ln r term is about 7 Wh/kg, four times the 1% target, and too large to plan from.
- **Online correction failed.** Refitting "DFN ≈ SPMe + -ln r" after each full run took 528 s to find a design within 1% of the best on pools of 64. The plain trust flag took 418 s.

**Two unplanned findings matter more.** Both came after the planned results were in, so they are leads, not findings.

- **One design carries SPMe's cost.** SPMe's long-run screen needs 14 full runs on pools of 64 almost entirely because of the single best design. That design is salt-depleted (r = 0.07). SPMe ranks it 1st after 10 cycles but 41st after 100. Remove it and the same screen needs about 2 runs.
- **A short SPMe run is the fastest screen yet.** Running every candidate through 10 cycles of SPMe (1.5 s each), then the full model in that order, reached a design within 1% of the best in a median 123 s on pools of 64 and 172 s on 96. GP-EI on the full model took 220 s. The best earlier screens took 153 and 199 s, and the co-kriging search from this morning took 144 and 174 s. On pools of 16 and 32, a 2-cycle SPMe run was fastest (38 and 52 s).

The practical reading, with that caveat attached: if you screen electrode designs with SPMe, a short run may serve you better than a corrected long one. The salt depletion that trips SPMe up is set in the first discharge. The damage to its score builds up over cycling. Why SPMe's 10-cycle ranking tracks DFN's 100-cycle ranking while its own 100-cycle ranking does not is now the programme's real question. The next step is to register these screens and test them on fresh designs and other parameter sets. All results are modelled: PyBaMM, the `OKane2022` parameter set, one protocol, and 128 designs reused across every step. Code, numbers and the pre-registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).

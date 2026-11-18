---
title: "A cheap battery model can tell you where it's wrong, but in our test it wasn't the cheap part"
seo_title: "When to trust SPMe over DFN in Li-ion cell design (PyBaMM)"
date: 2026-11-11
tags: [research, cell-fidelity, energy]
description: "SPMe's own minimum salt concentration flags the Li-ion designs it mis-scores (AUC 0.997), but a 2-cycle DFN run costs about the same: the cost is in the cycles."
---

Battery engineers often search over electrode designs (how thick, how porous, how much spare negative capacity) in simulation before they build anything. The full porous-electrode model, DFN, is the standard for this. Its reduced cousin, SPMe, is cheaper, so a search tends to use SPMe and check only the winners in DFN. [Earlier work here](../../research/energy-cell-dfn/README.md) found where that goes wrong. SPMe ranks most designs the way DFN does. But for a few thick, dense electrodes it gives 0 to 28 Wh/kg where DFN gives 120 to 146, because the salt in the electrolyte runs out. A search that believes SPMe throws that whole region away.

Today we opened a research programme on that problem, [`cell-fidelity`](../../research/cell-fidelity/README.md), and ran its first test. We wrote the hypotheses down before running anything.

**Can SPMe flag its own mistakes?** We ran each of the 49 designs through SPMe for just two charge and discharge cycles. For each, we recorded the lowest electrolyte concentration it reached. We called a design *untrusted* if SPMe's 100-cycle score was more than 25% below DFN's. Seven of the 49 were. The two-cycle minimum separated them from the rest with a ROC AUC of 0.997 (bootstrap 95% interval 0.980 to 1.000). If you flag every design whose salt drops below 10% of its starting value, you catch all seven and wrongly flag one. Three designs went *negative*, which SPMe's reduced electrolyte treatment allows. Real salt can't do that.

**The surprise was the cost.** We had planned around the idea that SPMe is the cheap rung, and we set a threshold: the hypothesis failed if a two-cycle SPMe run cost more than a quarter of a two-cycle DFN run. It cost 88%: 1.2 s against 1.3 s on one design, set-up included. Over 100 cycles the gap opens up (3.9 s against 27.9 s). So cutting cycles saves 21 times the DFN time, and swapping DFN for SPMe saves 7 times. If a short DFN run costs no more than the short SPMe run used to flag trouble, the cheapest trustworthy screen may just be a short DFN run.

That changes the next step. The programme's benchmark will now treat the number of cycles as a fidelity setting alongside the model, and ask whether an early-cycle DFN run ranks designs better than a full SPMe run at the same wall time.

What this doesn't show: it is one parameter set (PyBaMM's `OKane2022`, built on LG M50 data) and one charging protocol. The 49 designs were picked to spread across SPMe's ranking, so there are only seven positives. The timings come from one machine. No measured cell exists for these designs. Everything is modelled at stack level. The [proposal](../../research/cell-fidelity/PROPOSAL.md) lays out the rest of the plan: the theory behind the flag, a search comparison against multi-fidelity baselines over 10 or more seeds, and checks against measured cells.

Written with AI assistance (Claude).

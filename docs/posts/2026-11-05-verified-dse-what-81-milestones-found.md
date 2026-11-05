---
title: "Cheap estimates in chip-flow search: what 81 logged experiments found"
seo_title: "Multi-fidelity chip design search on SKY130: does a cheap estimate pay? Summary of verified-dse"
date: 2026-11-05
tags: [research, chip-design, optimisation, negative-result, summary]
description: "A summary of the verified-dse programme: on small SKY130 designs, ranking synthesis settings with a cheap pre-routing estimate did not beat routing at random, and what a pilot can and cannot certify."
---

The question behind the `verified-dse` programme: when you search synthesis pass sequences for a chip design, can a cheap estimate (generic gates, or mapped cells with no wires) decide which candidates deserve a full place-and-route run? This is a summary of what 81 logged milestones found. Every number below is quoted from `research/verified-dse/LOG.md` and `PAPER.md`; none is new.

**The cheap estimate is biased.** Against routed area x delay on ten small designs, the generic-gate rung has a median Kendall tau of about 0 (-0.04 at the tight clock). Picking by it costs a median 13.5% (tight) and 20% (relaxed). The mapped rung is close to routed at a relaxed clock (median pick regret 0%) but not at a tight one, where tau is below 0.7 on 6 of 10 designs.

**Used as a screen, it does not pay on these designs.** At equal wall-clock, screening the pool on the generic rung was worse than random routing on 10 of 10 designs at 10 s. Successive halving from the generic rung stayed near 10% regret at every budget of 10 s or more. Halving from the mapped rung won on most designs but lost heavily on a few (barrel shifter about 12%), so its mean was worse than random's. Model-based searches (ridge, TPE, GP, BOHB) did not rescue it either; the multiplier family at a relaxed clock left BOHB 6 to 14% above the best routed design on five of eight cells.

**A pilot gate did not close the gap.** A gate that checks the cheap estimate against a few routed probes cut BOHB's regret on failing cells from 5.88% to 3.27% at 40 routed-run equivalents, but the no-gate control (probes, then route first) reached 0.46%. With 25 or more equivalents, "do not cut on the cheap estimate" was as good as anything tried.

**Theory.** Successive halving's log regret is at most the sum of each cut rung's inversion, proved in a few lines and checked on all 40 cached cells. It is vacuous for the generic rung. A pilot's maximum only lower-bounds the inversion, so a pilot can suggest the bias but not certify it. A pilot-side regret certificate is still open.

**Caveats that matter.** Ten small designs plus larger multipliers, one library corner, pools of about 50 points. The numbers depend on the tool version: re-running under newer OpenROAD and Yosys changed R4 scores (tau 0.44 median against the cached table), and a fanout effect on pick regret moved by up to 93 points between Yosys versions, so only the direction of the rank-correlation trend is claimed. Detail routing (the reference beyond global route) agrees with global-route ordering on 5 designs (tau 0.65 to 0.93) and on 12 mult24 and 4 mult32 spread points.

Code, logs and the paper draft: `research/verified-dse/`. Still open: full detail-routed multiplier cells (about 12 core-hours each), a version-independent fanout result, and typesetting to the MLCAD template.

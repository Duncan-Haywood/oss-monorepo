---
title: "Ten copies, not five: the dip in yesterday's survey rule was noise, and its cost is a step"
seo_title: "Network survey reciprocity rule: ten Monte Carlo copies"
date: 2026-11-20
tags: [research, networks, diffusion, seeding, surveys]
description: "Rerun with ten Monte Carlo copies, the half-weight rule's odd dip vanishes; its cost appears once a quarter of false ties are mutual and stays flat."
---

The `civ-seeding` programme asks whom a rollout should seed in the 43 Karnataka village networks of Banerjee, Chandrasekhar, Duflo and Jackson (2013), when the network comes from a survey that forgets real ties and invents false ones. [This morning's run](2026-11-20-half-a-tie-does-not-travel.md) tested a rule for the invented ones: count a tie only one end names as half a tie. It found the rule worse than keeping every report in one case, one false tie per four true ones placed among friends of friends, and left a puzzle there. The rule did worse when half of the false ties were named by both ends (2.43% of adopters lost) than when all of them were (2.19%). Five Monte Carlo copies could not say whether that was a mechanism or chance.

This run took that one case to ten copies and added two more shares of mutual false ties. Copies 0 to 4 reproduce the earlier run to 5 × 10⁻⁶; copies 5 to 9 are new random streams. The hypotheses were written into the [log](../../research/civ-seeding/LOG.md) before the run.

| census degree discount, worst-case regret | share of false ties both ends name: 0 | 0.25 | 0.5 | 0.75 | 1 |
|---|---|---|---|---|---|
| keep every report | 1.91% | 1.91% | 1.91% | 1.91% | 1.91% |
| drop one-sided ties | 2.14% | | 2.30% | | 2.96% |
| half weight, ten copies | 1.83% | 2.32% | 2.27% | 2.21% | 2.33% |
| half weight, the first five copies | 1.84% | 2.25% | 2.43% | 2.27% | 2.19% |

**The dip was noise.** Over ten copies the difference between half and all mutual is −0.06 point (Monte Carlo se 0.16), and on the five new copies alone its sign reverses.

**The cost is a step, not a slope.** With no mutual false ties the half weight ties keeping every report (−0.08, se 0.11). From a quarter mutual upward it costs 0.30 to 0.42 point (z 2.9 to 3.9) and stays flat. Dropping one-sided ties outright gets steadily worse instead, up to +1.05 point (z 7.0) when every false tie is mutual. Our guess, not yet tested: a mutual false tie keeps full weight while the one-sided true ties around it are halved, so a few of them distort the seeding as much as many.

**The advice is unchanged.** A survey team cannot measure how many of its false ties are mutual, since a mutual false tie looks exactly like a real one. In this case keeping every report is the safest choice (1.91%), the half weight comes second (worst 2.33%) and dropping one-sided ties comes last (worst 2.96%). The extra copies also moved some of this morning's numbers by up to 0.19 point. That is a reason to put the paper's key contrasts on ten copies, which is the programme's next step.

All of this is simulation on the real village networks, with forgetting at the rate measured in the same survey and false ties at swept, assumed rates. Code and numbers: [`run.py`](../../research/civ-seeding/experiments/m21_kappa_dip/run.py), [`verdicts.txt`](../../research/civ-seeding/experiments/m21_kappa_dip/verdicts.txt), and the [programme page](../../research/civ-seeding/README.md). Written with AI assistance (Claude Code).

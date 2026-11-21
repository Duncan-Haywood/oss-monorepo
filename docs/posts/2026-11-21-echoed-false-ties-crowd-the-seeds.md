---
title: "Echoed false ties crowd a rollout's seeds together, and the cost is a slope, not a step"
seo_title: "Network survey false ties: why degree discount seeds crowd"
date: 2026-11-21
tags: [research, networks, diffusion, seeding, surveys]
description: "Under the fitted contagion models, echoed false survey ties cost degree discount smoothly, by making its seeds neighbours of each other, not weaker picks."
---

The `civ-seeding` programme asks whom a rollout should seed in the 43 Karnataka village networks of Banerjee, Chandrasekhar, Duflo and Jackson (2013), when the network comes from a survey that forgets real ties and invents false ones. [This morning's run](2026-11-21-where-the-half-tie-step-sits.md) found that the rule "count a tie only one end names as half a tie" holds until a tenth of false ties are named by both ends and then jumps 0.47 point worse in worst-case regret by a quarter. The seed sets themselves change smoothly over that window. So the swaps get more expensive, not more numerous. This run looked at the swaps directly.

**The setup.** The same 4,300 seed draws (43 villages, 100 survey draws each), census degree discount, one triangle-closing false tie per four true ones, 85% recall. Each seed set was scored under the three fitted contagion models with 40 shared random runs per village, so differences between rules are measured on the same noise. The hypotheses were written into the [log](../../research/civ-seeding/LOG.md) before the run.

| half weight, share of false ties named by both ends | 0 | 0.1 | 0.25 | keep every report |
|---|---|---|---|---|
| adopters, 43 villages, mean of three models | 1896.5 | 1895.7 | 1894.1 | 1891.7 |
| households a seed or its true neighbour | 87.22% | 87.15% | 86.94% | 86.65% |
| true ties among the seeds | 1,720 | 1,729 | 1,755 | 1,717 |

**Under the fitted models there is no step.** The half weight loses 0.80 adopters from no echoed false ties to a tenth (z 5.5) and 1.65 more by a quarter (z 10.4). Per unit of echo share, that is 8 and then 11 adopters. The slope steepens a little, and all three models agree. So the step in worst-case regret is not in the average process. It comes from the refitted processes that set the worst case, which turn a 0.09% average loss into almost half a point of regret. Which processes those are is the next question.

**The swaps cost by crowding, not by picking weaker households.** I expected the swapped-in seeds to have fewer real ties. They do, but only by 0.33 ties in the costly window, less than the 0.45 in the cheap window before it. What changes faster is how close the seeds sit to each other. From a tenth to a quarter, the seeds gain 26 true ties among themselves (se 2.6) and reach 0.21 point fewer households (se 0.02), against 9 ties and 0.06 point before. Per unit of echo share, the crowding steepens 2.2 times while the adopter loss steepens 1.4 times. Degree discount exists to spread seeds apart, and echoed false ties among friends of friends seem to blunt exactly that. This is my guess, not a test. The loss is also not a few villages: 42 of 43 lose.

**The advice stands.** Under the fitted models the half weight still beats keeping every report at every echo share (+2.4 adopters at a quarter, z 11.8). It loses only in the worst case over refitted models. A field team cannot measure how many false reports are echoed, so keeping every report is still the safe choice.

This is simulation on the real village networks, with forgetting at the rate measured in the same survey and false ties at swept, assumed rates. One copy of the seed draws and the point fits only. Code and numbers: [`run.py`](../../research/civ-seeding/experiments/m23_swaps/run.py), [`results.txt`](../../research/civ-seeding/experiments/m23_swaps/results.txt), and the [programme page](../../research/civ-seeding/README.md). Written with AI assistance (Claude Code).

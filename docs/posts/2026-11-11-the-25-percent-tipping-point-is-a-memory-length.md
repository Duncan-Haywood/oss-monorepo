---
title: "The 25% tipping point is a statement about memory, and clustering the committed backfires"
seo_title: "25% tipping point for social conventions: what sets it"
date: 2026-11-11
tags: [research, simulation, social-science]
description: "In a memory-based naming game the committed minority needed to flip a convention runs from 11% to 42% as memory grows; 25% means people weigh their last 11 to 13 encounters."
---

Centola et al. (2018, *Science*) ran groups of 20 people who settled on a naming convention, then added confederates pushing a new name. The convention flipped only once the confederates reached about a quarter of the group, and the "25% rule" has been quoted widely since. We asked two questions of the model class behind it: is 25% a constant, and does it matter where the committed people sit?

In our model, each person says whichever name is most common among the last M names they heard, and committed people always say the new one. The mean-field critical mass depends entirely on M: 11% at M = 3, 20% at 7, 24% at 11, 26% at 13, 32% at 31 and 42% at 201. So 25% matches people who weigh about their last 11 to 13 encounters. Simulated groups of 20 come within 0.03 of these figures. Cut the horizon from 200 rounds to 50 and the measured tipping point rises by about one person (to 30%), so how long the experiment runs also shapes the number. As a check, our re-derivation of Xie et al.'s (2011) binary agreement game gives their published critical fraction of 9.79%.

Placement surprised us. In an earlier run on complex contagion, a tight cluster of seeds was the best way to start a cascade. In this model it is the worst. On a ring network of 1,000 people, a single block of committed people never flips the rest, even when the block is half the population. The same number scattered at random flips everyone from 10%, under half the mean-field figure. The difference is the rule. In a contagion, adopters stay adopted, so a cluster reinforces its own edge. Under a majority rule, people at the cluster's edge still hear the old name from the other side, and no more than half of their contacts are ever committed.

Memory and network are swept, not measured. Agents hear one neighbour per round instead of playing in pairs as the participants did. We could not read the paper's own model settings from this session, so this checks the model class, not their figure. The results describe simulated people, not advice for steering real groups. Code, results and the hypotheses we wrote before the run are in `research/civ-levers` (LOG.md, 2026-11-11).

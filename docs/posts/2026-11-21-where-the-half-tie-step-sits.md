---
title: "Where the half-tie rule's step sits, and why a perfect labeller would not save it"
seo_title: "Network survey false ties: where the half-weight rule breaks"
date: 2026-11-21
tags: [research, networks, diffusion, seeding, surveys]
description: "The half-weight rule for one-sided survey ties holds until a tenth of false ties are mutual and fails by a quarter; an oracle only ties keeping every report."
---

The `civ-seeding` programme asks whom a rollout should seed in the 43 Karnataka village networks of Banerjee, Chandrasekhar, Duflo and Jackson (2013), when the network comes from a survey that forgets real ties and invents false ones. [Yesterday's run](2026-11-20-the-dip-was-noise-half-a-tie-costs-a-step.md) found that one rule for the invented ties fails in a step. The rule counts a tie that only one end names as half a tie. In a census with one triangle-closing false tie per four true ones, it beats keeping every report when no false tie is named by both ends. Once a quarter of them are, it is worse by about 0.4 point, and it stays there. That run guessed at why.

**Part of the answer was in the code.** In a census, the share of false ties both ends name (κ) changes only which false ties keep full weight. The forgetting draw is shared across κ. The echo draw is one random matrix cut at κ, so the full-weight false ties at κ = 0.1 are a subset of those at κ = 0.25. True ties get the same weights at every κ. This is now a unit test. So the rule's whole response to κ comes from the false ties, and the open questions were where the step sits and what halving real one-sided ties costs on its own. The hypotheses were written into the [log](../../research/civ-seeding/LOG.md) before the run.

| census degree discount, ten Monte Carlo copies | κ = 0 | 0.05 | 0.1 | 0.25 | 1 |
|---|---|---|---|---|---|
| keep every report | 1.91% | 1.91% | 1.91% | 1.91% | 1.91% |
| half weight | 1.83% | 1.86% | 1.85% | 2.32% | 2.33% |
| oracle: halve only one-sided false ties | 1.61% | | | 1.95% | |
| seeds swapped from the κ = 0 set | 0% | 10.5% | 14.1% | 18.6% | 25.0% |

The figures are worst-case adopters lost against the best of 47 rules, joint median, with Monte Carlo se of 0.08 to 0.14 point.

**The step sits between a tenth and a quarter.** Up to κ = 0.1 the rule is where it was with no mutual false ties (+0.01, se 0.16). From 0.1 to 0.25 it jumps +0.47 point (z 4.1), then stays flat to κ = 1. The mean over draws shows the same jump, so it is not an artefact of taking a median.

**It is a step in what the swaps cost, not in how many there are.** The seed sets drift smoothly: 10% of seeds change by κ = 0.05, 14% by 0.1, 19% by 0.25. Up to a tenth, the swapped-in seeds are as good as the ones they replace. By a quarter, when nine in ten seeds carry at least one full-weight false tie, they are not. Why the swaps turn costly in that window is still open.

**Even perfect knowledge would not rescue it.** An oracle that knows which one-sided ties are false and halves only those beats the half weight by 0.37 point at κ = 0.25 (z 2.6), which is what halving real one-sided ties costs. But it only ties keeping every report (+0.04, se 0.16). Once a quarter of the false ties look mutual, labelling the rest perfectly buys nothing.

**The advice is unchanged, and now firmer.** A field team cannot measure how many of its false reports are echoed, since a mutual false tie looks exactly like a real one. So: keep every report, unless there is reason to think false ties are almost never named by both ends.

This is simulation on the real village networks, with forgetting at the rate measured in the same survey and false ties at swept, assumed rates; the oracle is a diagnostic no survey could run. Code and numbers: [`run.py`](../../research/civ-seeding/experiments/m22_step/run.py), [`verdicts.txt`](../../research/civ-seeding/experiments/m22_step/verdicts.txt), [`seeds.txt`](../../research/civ-seeding/experiments/m22_step/seeds.txt), and the [programme page](../../research/civ-seeding/README.md). Written with AI assistance (Claude Code).

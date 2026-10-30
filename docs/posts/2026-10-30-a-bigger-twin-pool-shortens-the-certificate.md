---
title: "Can a simulator shorten a robot-safety certificate? Only with a big enough pool of runs"
date: 2026-10-30
tags: [research, sim2real, digital-twins, confidence-intervals]
description: "In our sim-to-real inference programme, a twin-assisted interval beat real-only betting on 20 of 21 pendulum pairs with 20,000 twin runs, 7 to 8 with 4,000, and none with 500."
---

A digital twin gives unlimited runs that are biased. Real trials are unbiased and scarce. We have been asking, in the [sim-to-real inference programme](https://duncan-haywood.github.io/oss-monorepo/research/sim2real-inference/), whether a twin can shorten a confidence interval that stays valid whatever the twin's bias.

For point estimates the answer is yes: pairing twin and real runs on the same starting state multiplies the effective real sample by up to 3.2 on our 21 MuJoCo pairs. For guaranteed intervals, five of our constructions were valid but never tighter than the real-only baseline.

**What changed.** Betting intervals allow a larger bet than we first used, and the twin's mean can be bounded from its own runs with a second interval (a union bound keeps the total at 95%). With a pool of 960 real runs:

| Twin runs | Pendulum pairs where the twin-assisted interval is narrower |
|---|---|
| 500 | 0 of 21 |
| 4,000 | 7 to 8 of 21 |
| 20,000 | 20 of 21 (median width ratio 0.84 to 0.86) |

Coverage was at least 98% throughout. On cart-pole it won in only 7 of 168 cells, and we do not yet know why. The best explanation so far is a ceiling effect, and it is only partly supported.

**What this does not show.** These are model-versus-model pairs, not a real robot. The 20,000 draws are resampled from a 4,000-context pool, so the result concerns interval width only. Per-episode real outcomes for a published benchmark (SIMPLER) are not public, so we could not check the effect on real pairs.

The paper draft now says this in its main text instead of only in the appendix. Full log: `research/sim2real-inference/LOG.md`, entries 7h to 7j and 7y.

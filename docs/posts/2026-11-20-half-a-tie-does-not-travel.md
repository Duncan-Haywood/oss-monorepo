---
title: "Half a tie does not travel: yesterday's survey rule passes two of five checks in new cases"
seo_title: "Soft reciprocity filter for network surveys: a robustness check"
date: 2026-11-20
tags: [research, networks, diffusion, seeding, surveys]
description: "Counting a one-sided survey tie as half a tie beat dropping it in every new case, but not keeping it. Two of five pre-registered hypotheses held."
---

The `civ-seeding` programme asks which households a rollout should reach first, on the 43 Karnataka village networks of Banerjee, Chandrasekhar, Duflo and Jackson (2013). Its best rule is *degree discount* on a census of the network. [Yesterday's step](2026-11-19-count-a-one-sided-tie-as-half-a-tie.md) proposed a fix for false ties in that census: when two surveyed households could both have named a tie but only one did, count it as half a tie. In the one case tested, it saved 0.73 point of adopters and was never measurably worse than keeping every report.

That case was the worst one from earlier steps: one false tie per two true ones, placed among friends of friends. A survey team cannot tune the weight to an error rate it does not know. So today the half weight was fixed in advance and taken unchanged to three cases a team would meet more often:

- no false ties at all;
- one false tie per four true ones, closing triangles;
- one false tie per two, placed at random.

Each case was run at three shares κ of false ties that both ends name (0, half, all). Both census rules were scored three ways: keep every report, drop one-sided ties (the usual reciprocity filter), and the half weight. Every rule got five Monte Carlo copies over 500 joint bootstrap draws of the fitted adoption models. The 16 rules earlier steps had already run reproduced their numbers to 5e-6. The five hypotheses and the predictions were written down before the run.

## What it found

Median worst-case share of adopters lost by census degree discount (lower is better):

| case | keep every report | drop one-sided, κ = 0 / ½ / 1 | half weight, κ = 0 / ½ / 1 |
|---|---|---|---|
| no false ties | 1.82% | 1.93% | 1.45% |
| 1 per 4, closing triangles | 1.92% | 2.20 / 2.27 / 2.77% | 1.84 / 2.43 / 2.19% |
| 1 per 2, random | 2.16% | 1.75 / 2.15 / 2.69% | 1.83 / 2.39 / 2.23% |
| 1 per 2, closing triangles (yesterday) | 2.78% | 2.18 / 2.99 / 3.41% | 2.05 / 2.49 / 2.83% |

- **Held:** with no false ties, the half weight costs plain top-degree ranking +0.20 point (se 0.14), about what dropping one-sided ties costs.
- **Held:** the half weight's worst case is below the reciprocity filter's in both new false-tie cases (2.43% against 2.77%, and 2.39% against 2.69%).
- **Refuted:** at one false tie per four, with half of them mutual, the half weight is *worse* than keeping every report by 0.50 point (z 4.3).
- **Refuted:** with random false ties and none mutual, it saves 0.33 point (z −1.6), short of the bar. The plain filter saves 0.41 there.
- **Refuted:** its worst case is above keeping every report in both new cases.

The plan expected all five to hold. Two did.

## What it means for a survey team

Over all four cases and three κ values, the worst case is 2.78% for keeping every report, 2.83% for the half weight and 3.41% for the reciprocity filter. A team that knows nothing about its false ties does about equally well keeping every report or using the half weight. The usual filter is never the safe choice. The half weight pays only when false ties are many, close triangles and are mostly named by one end. That is yesterday's case. Yesterday's headline, "never measurably worse than keeping every report", was true there and is not true in general.

One result is unexplained. With one false tie per four, the half weight scores worse when half of false ties are mutual than when all are (2.43% against 2.19%). Five copies cannot tell that from noise. Ten copies of those cells is the next check, then the paper's tables.

Code, results and the logged plan: [`research/civ-seeding`](../../research/civ-seeding/README.md), milestone 20 ([`verdicts.txt`](../../research/civ-seeding/experiments/m20_soft_cells/verdicts.txt)).

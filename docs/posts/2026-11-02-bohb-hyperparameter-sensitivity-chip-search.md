---
title: "Does the BOHB win in our chip-flow search survive changing its settings?"
seo_title: "Does the BOHB chip-search win survive changed settings?"
date: 2026-11-02
tags: [verified-dse, chip-design, research]
description: Varying the three untuned settings of a BOHB search over open-source chip flows showed its low-budget win holds at 15 runs but not on the pooled mean at 25.
---

We are searching open-source chip flows (Yosys, ABC, OpenROAD on SKY130) for good designs cheaply, by ranking candidates on cheap flow stages and only paying for place-and-route on survivors. An earlier step found that a density-model sampler inside a Hyperband schedule (BOHB) beat random routed runs at low budget, using hyperparameters nobody had tuned.

Before building on that, we varied each setting one at a time across 50 design and clock cells, 100 paired seeds, replaying cached flow results (no new flow runs, under 10 minutes).

What came out, as mean regret against the best design found:

- At a budget of 15 routed runs, BOHB beat random routing in all 8 alternative settings (2.0 to 3.1 % against 3.4 %).
- Requiring 10 observations before the model starts nearly erases that gain (3.14 %), because the model rarely switches on in a small budget.
- At 25 runs the default is not below random on the pooled mean (1.74 against 1.68 %); the earlier claim there was about per-cell win counts. Our write-up now says so.
- At 40 runs random routing wins in every setting.

Two of our four predictions held fully, one held on direction but not size, and one was half wrong. The settings were scored on the cells they were picked from, so we propose no new default. Code, table and log: `research/verified-dse/experiments/bohb/`.

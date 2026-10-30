---
title: "A toy civilization that never cycles: the null result in our structural-demographic model"
seo_title: "Structural-demographic model: 864 parameter sets, no secular cycles"
date: 2026-10-30
tags: [research, civ-levers, simulation]
description: "We built a minimal Turchin-style model of peasants, elites and a state. In 864 parameter sets it never produced a secular cycle, whichever lever we pulled."
---

Peter Turchin's structural-demographic theory says agrarian states swing through 150 to 400 year cycles: population grows, wages fall, too many elites compete for rent, the state weakens, and instability resets the system. We wanted to ask which policy levers (higher taxes, a cap on elite numbers, a welfare transfer) flatten those swings in a simulated civilization.

First we needed the cycles. We built a minimal version in [civ-levers](https://duncan-haywood.github.io/oss-monorepo/research/civ-levers/): fixed land, peasants who keep their marginal product, rent that goes to the state and to elites, elites who multiply when their income beats their aspiration, and an instability term driven by elite numbers, low wages and a weak state. With instability switched off, it reaches the Malthusian equilibrium exactly, as it should.

Then we swept the seven parameters nobody has measured, 864 combinations. Not one cycled. The biggest population swing was 0.23% of the mean. A few settings ended in permanent unrest instead. The three levers changed how deep the first fall went (minimum population 0.76 with no lever, 0.85 with doubled taxes, 0.92 with a welfare transfer) but there was no cycle to flatten.

That is a result about our closure, not about Turchin's theory. His cycles rely on delayed feedback we left out: elite numbers that respond to population with a generation's lag, and a state collapse that resets the stress. Those go in next, with the published 150 to 400 year period as the test the model must pass before we trust any lever ranking. These are simulated people under stated rules, not a forecast about any real society. Produced with AI assistance (Claude).

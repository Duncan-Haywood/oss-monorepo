---
title: "What happens to a ranking survey when people favour the first option"
date: 2026-10-27
description: "A simulation of quick-pick-survey's pair selectors against respondents who pick the first option shown on 10 to 50% of answers."
tags: [quick-pick-survey, surveys, statistics]
---

[quick-pick-survey](../../ventures/quick-pick-survey/) ranks a list from "which do you prefer?" pairs. Real respondents tire and tap the first card. We simulated that: a share of answers takes the first option whatever the items are, 30 items, 20 seeded respondents per cell, rank accuracy as Spearman correlation with the true order.

At 300 answers the staged hybrid selector beat the shipped one at 10% and 30% bias (0.900 vs 0.880, 0.803 vs 0.780). At 50% bias it lost (0.592 vs 0.632), and the pure information-gain selector fell to 0.421. So half-random respondents are where the hybrid stops paying.

These are synthetic respondents, not real survey data. The next step is a detector that falls back to the shipped selector when someone's first-option share runs far above half. Numbers and test: `docs/INFORMATION-GAIN-SELECTOR.md` in the venture.

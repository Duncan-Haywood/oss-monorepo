---
title: "A rare-category audit sized without any human label stays valid, at about twice the cost"
date: 2026-10-27
description: "Sizing a rare-category audit from the coder's own positive share covered 91.8 to 94.4% at 1.9 to 2.8 times the oracle size, where stopping rules failed."
tags: [llm-coding-inference, research, audit, prediction-powered-inference]
---

Milestone 6x of [llm-coding-inference](../../research/llm-coding-inference/). Stopping an audit when its interval looks narrow enough covered fear (1.15% prevalence) only 64% of the time at a 0.5-point target, because stopping selects audits that saw few positives (6t to 6w). The fix tried here removes human labels from the size decision: plan n from the coder's positive share per group, variance pf(1-pf), then draw one audit. On GoEmotions fear and sadness, 500 draws per cell, coverage was 91.8, 92.8, 93.6 and 94.4%, at 1.94 to 2.79 times the oracle audit size.

Caveats: one corpus, one naive-Bayes coder that flags about three times the true rate (so it over-plans by design), 500 draws (coverage +/- 2 points). My prediction that doubling the proxy would double the cost was wrong (1.2 to 1.7x, because of the finite-population term). The log and script are in the project directory; the plan was written before the run.

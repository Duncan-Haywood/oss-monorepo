---
title: "Does the 0.3 informedness cutoff matter? A sweep on LLM-coded audits"
date: 2026-10-30
tags: [llm-coding-inference, research, prediction-powered-inference]
description: "Sweeping the J_hat cutoff of a pooled-vs-coder-cell audit screen from 0.1 to 0.5 moved half-widths by under 1% once a prevalence guard was in place."
---

The [llm-coding-inference](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/llm-coding-inference) programme asks how many items a researcher must hand-code to get a valid interval from LLM-coded text. Its latest rule says: use the coder's own positive and negative cells as audit strata only if a 30% pilot shows the coder is informative (estimated J = sensitivity + specificity - 1 at least 0.3) and holds at least 20 human positives; otherwise pool.

The 0.3 was picked before looking. Milestone 6am sweeps it from 0.1 to 0.5 on cached Qwen2.5 zero-shot scores (GoEmotions admiration, neutral, fear, sadness; NaijaSenti negative share), 500 audits per cell.

- With the guard, admiration, fear and sadness do not change at all between 0.1 and 0.4.
- Neutral and NaijaSenti 1.5B, whose coders sit near J = 0.2, are the only cases where the cutoff changes which design runs, and half-widths differ by under 1%.
- 0.1 is too eager on a useless coder: NaijaSenti 3B at n = 400 is 3.9% wider than at 0.3.
- Coverage (Wilson on the effective size) is 92.6 to 96.6% in every cell, and the lowest cell is the same at every cutoff.

So 0.3 is not a knife edge; anything from 0.2 to 0.5 gives the same result here. What is still untested is an informative coder on a second corpus, which needs model weights this run could not download. Numbers: `experiments/h6am_tau.txt`.

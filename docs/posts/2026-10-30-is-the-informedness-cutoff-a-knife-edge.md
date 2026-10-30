---
title: "Is the 0.3 informedness cutoff a knife edge? Not between 0.2 and 0.5"
date: 2026-10-30
tags: [llm-coding-inference, research, audit-design]
description: "Sweeping the cutoff that decides whether an audit is split by an LLM coder's own labels: nothing moves by more than 1% in width from 0.2 to 0.5; only 0.1 is too eager."
---

When you audit an LLM's text coding by hand, you can split the audit by the coder's own label (positive or negative), but only if the coder is informative. The [llm-coding-inference](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/llm-coding-inference) programme uses a pilot to estimate the coder's informedness J (sensitivity plus specificity minus one) and splits only when J is at least 0.3 and the pilot holds 20 human positives. The 0.3 was chosen before looking and never tested.

**What we ran.** The same screen at cutoffs 0.1, 0.2, 0.3, 0.4 and 0.5, on GoEmotions and NaijaSenti with cached Qwen2.5 scores, 500 draws per cell.

**Result.** From 0.2 to 0.5 the interval half-width stays within 1% of the 0.3 row in every cell. Only 0.1 is too eager: on NaijaSenti with the 3B model at n = 400 it uses coder cells in 18% of draws and is 3.9% wider. Lowest coverage anywhere was 92.6%, identical at every cutoff, so not a cutoff effect.

**Limit.** Still four coders and two corpora, and one informative coder; a second informative coder needs model weights we could not fetch this session. No coverage theorem. Details are in the programme's `LOG.md` (milestone 6am) and paper section 6.

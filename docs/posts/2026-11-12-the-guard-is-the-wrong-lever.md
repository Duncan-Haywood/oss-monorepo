---
title: "The guard is the wrong lever: a pre-registered negative on small LLM-coding audits"
seo_title: "LLM coding audit at small n: a bigger miss guard does not help"
date: 2026-11-12
tags: [research, llm, statistics, qualitative-coding]
description: "A miss guard of 5 instead of 3 fixed two of three small LLM-coding audits that ran wider than a random sample, and gave back 28% of the gain elsewhere."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The audit rule can split the hand-coded
sample along the model's own yes/no calls. Yesterday's step set the library default
(a minimum pilot informedness of 0.1, and at least 3 pilot positives the model
missed). It came with a known cost: with 500 hand-coded items and a weak model,
intervals were 1.4 to 2.7% *wider* than a plain random audit.

My guess was that those small audits saw too few misses to estimate the split well,
so raising the miss guard from 3 to 5 or 8 would send them to the plain audit at
little cost to larger ones. I forecast how often each guard would use the split
in 15 GoEmotions cells (two Qwen2.5 model sizes, five categories by size, 500,
1,000 and 2,000 items) and fixed the decision rule before running 1,000 simulated
audits per cell and guard.

- The forecasts held: all 45 rows within 3.0 points. Coverage was 93.4% or more
  in every row.
- A guard of 5 fixed two of the three costly cells (fear with both models) but
  not the third (the small model on sadness: 1.027 to 1.025 times the plain width).
- It also gave back 28% of the width the split buys elsewhere, most at 1,000
  items (the 1.5B model on sadness went from 14% narrower to 4%). A guard of 8
  gave back 61%.

So the default stays at 3. With it, 4 of 15 cells are up to 2.7% wider than the
plain audit, and 10 are 4 to 29% narrower. That trade is worth keeping.

The useful surprise was the small model on sadness. It was wider than plain at
1,000 items under every guard, and wider still as the guard rose. At 2,000 items
it was 6% narrower. So the miss count is not what decides when the split pays.
What decides it is how far apart the model's two cells really are, which the
pilot can estimate too. That forecast is the next step. One run per cell, one
corpus, one model family. Details:
[LOG.md](../../research/llm-coding-inference/LOG.md).

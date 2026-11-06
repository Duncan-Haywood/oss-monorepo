---
title: "Does a small LLM coder let you audit a rare category with fewer hand-labels?"
seo_title: "Audit design for LLM-coded text with rare categories: coverage and width on GoEmotions"
date: 2026-11-06
tags: [llm-coding-inference, prediction-powered-inference, research]
description: "A 500-draw check of the llm-coding-inference audit planner with a real zero-shot LLM coder on three GoEmotions categories: valid everywhere, narrower only where the category is not rare."
---

When an LLM labels a corpus of text and people hand-check a sample, how wide is the interval on a category's share, and how often does it cover the truth? This run tested the repository's audit planner with a cached zero-shot Qwen2.5-1.5B-Instruct coder on three GoEmotions categories (fear 1.15%, sadness 2.30%, admiration 8.1%), 500 simulated audits of 1,000 items each.

Coverage held: the shipped default covered 93.8 to 95.2% in all three. The width gain did not: it was 20% narrower than the plain pooled interval for admiration, but under 1% for fear and sadness, because the planner's screen sends nearly every rare-category draw to the pooled design. With the screen off and only the negative-cell guard on, the same two categories were 7% and 14% narrower at 97.0% coverage.

One corpus, one small model, one prompt, one run each, 500 draws (about 1.9 points of coverage noise). I also wrote the admiration prevalence wrong in my plan ("under 6%") and corrected it in the log. Details: `research/llm-coding-inference/LOG.md`, milestone 7x.

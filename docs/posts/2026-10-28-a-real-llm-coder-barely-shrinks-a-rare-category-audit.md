---
title: "A real LLM coder barely shrinks a rare-category audit"
date: 2026-10-28
description: "Qwen2.5-1.5B coded 6,683 GoEmotions comments for fear and sadness. With twice the informedness of naive Bayes it cut the human audit by at most 12%, not 3x."
tags: [llm-coding-inference, research, prediction-powered-inference]
---

# A real LLM coder barely shrinks a rare-category audit

*Written by an AI agent working in this repository. A research log entry, not a published result.*

Question: if an LLM codes a rare category (fear is 1.15% of GoEmotions comments, sadness 2.3%), how many human-checked items do you still need to estimate its prevalence to half a point?

We coded all 6,683 test comments with Qwen2.5-1.5B-Instruct, zero-shot, one yes/no prompt per category, and compared it with the naive Bayes coder used in earlier steps. The LLM is much better at telling the category apart (Youden J 0.46 and 0.62 against 0.22 and 0.32). The oracle audit size for a 0.5-point half-width, human-only versus prediction-powered, still barely moves: fear 1,368 to 1,253 items, sadness 2,242 to 1,971 at best, a saving of 8 to 12%.

At fixed audit sizes the tuned estimator sometimes covers less than human-only (sadness, n = 400, 90.0% against 94.0%), because the weight is estimated from a handful of positives. Fear audits of 400 cover only 85 to 89% either way.

One corpus, one small model, one prompt, 500 draws per cell; a larger model or few-shot prompts are untested. Code, cached scores and the log: `research/llm-coding-inference/` (milestone 6ab).

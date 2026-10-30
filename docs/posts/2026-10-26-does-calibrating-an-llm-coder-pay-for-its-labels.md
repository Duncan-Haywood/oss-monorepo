---
title: "Does calibrating an LLM coder pay for the human labels it uses?"
date: 2026-10-26
description: "Choosing a Yes/No cut for a small local LLM on 100 human labels, then charging those labels to the comparison, still loses to simply hand-coding more items."
tags: [research, llm-coding-inference, prediction-powered-inference, qualitative-coding]
---

Earlier steps in [llm-coding-inference](../../research/llm-coding-inference/) found that a small zero-shot LLM coder narrows a valid confidence interval by only 0 to 2%, and that the cut on its Yes/No score matters more than model size. This step moved the cut: it was chosen on 100 human-labelled tweets (balanced accuracy), and those 100 labels were charged to the hand-coding comparator.

Result on 6,000 NaijaSenti tweets with Qwen2.5 0.5B, 1.5B and 3B: the PPI++ interval from n audit labels is 11 to 44% wider than hand-coding with n + 100 labels, for n = 100 to 400. Coverage stayed at 93.9 to 95.0%. The 0.5B score carries no usable signal; 1.5B and 3B do, but not enough to repay the labels. A better coder, not a better cut, is the open route. One corpus, one prompt, one cut rule; numbers and code in the project's `LOG.md` and `experiments/h5c_*`.

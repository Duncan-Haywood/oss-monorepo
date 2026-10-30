---
title: "How good must an LLM coder be before it shrinks your audit? The paper draft's answer"
seo_title: "How good must an LLM coder be before it shrinks your audit?"
date: 2026-10-26
description: "Draft 1.1 of the llm-coding-inference paper: about 0.80 agreement, errors unrelated to length or label, is needed to pay; small Qwen coders fall short."
tags: [research, llm-coding-inference, ppi, annotation]
---

The [llm-coding-inference](../../research/llm-coding-inference/) paper draft now has a section on what a coder must be before prediction-powered inference gives a narrower interval than hand-coding alone. The earlier posts reported pieces of it; this collects them.

On 6,000 NaijaSenti tweets, at an audit of 400, a coder that flips the human label independently gives a width ratio against human-only of 0.934 at 0.70 agreement, 0.898 at 0.75, 0.811 at 0.80 and 0.656 at 0.90. So a 20% cut needs roughly 0.80. Real Qwen2.5 coders (0.5B, 1.5B, 3B) agree 0.66 to 0.69 and give 0.978 to 0.996. A synthetic coder whose error probability is fitted to the real 1.5B and 3B errors reproduces those ratios (0.985 and 0.993 against 0.978 and 0.993), so the null is what a coder of that accuracy and error structure should give, not an anomaly.

Writing it up caught a mistake in our own log: the break-even entry said a 20% gain needs 0.75, but its table shows 0.898 there, a 10% cut. The paper and log now say 0.80.

Not shown: that a 7B or larger model reaches 0.80, or that the result holds on another corpus. One corpus, one prompt, one error draw per cell. Numbers and scripts are in the project's `LOG.md` and `experiments/`.

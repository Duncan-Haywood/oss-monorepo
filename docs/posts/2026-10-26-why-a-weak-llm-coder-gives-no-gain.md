---
title: "Why a 0.7-accuracy LLM coder barely helps survey inference, tested with synthetic coders"
seo_title: Why a 0.7-accuracy LLM coder barely helps survey inference
date: 2026-10-26
description: "Synthetic coders with five error shapes show that at 0.60 to 0.70 agreement, prediction-powered inference narrows intervals by only 0 to 14%."
tags: [research, llm-coding-inference, ppi, annotation]
---

[llm-coding-inference](../../research/llm-coding-inference/) asks when an LLM coder plus a small human audit gives a tighter confidence interval than the audit alone. Three real Qwen coders (0.5B, 1.5B, 3B) gave almost no gain, and earlier synthetic runs left that unexplained.

Milestone 5f repeats the synthetic test at the real coders' accuracy: coders that agree with the human label 70% and 60% of the time, with errors independent, group-, length-, label- or "@"-dependent, 600 draws per cell, 6,000 items. At 0.70 the PPI++ interval is 3.5 to 14% narrower than human-only (width ratio 0.86 to 0.97 at n = 100 to 400); at 0.60 it is 0.92 to 0.99. The real 1.5B and 3B coders (0.978 and 0.993 at n = 400) sit inside that range, so their null result is expected for a coder this accurate. Two of my five predictions' directions were wrong (error concentrated in a subset made things better, not worse).

Preliminary: synthetic coders, illustrative weights, one corpus. Next is fitting the error model to the real coders' mistakes.

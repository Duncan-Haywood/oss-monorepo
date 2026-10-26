---
title: "Agreement was the wrong number: why small LLM coders gave prediction-powered inference no gain"
date: 2026-10-26
description: "On 6,000 NaijaSenti tweets, small Qwen coders at 66 to 69% agreement are near-constant codes. Their Youden J, not agreement, explains why prediction-powered inference was no narrower than hand-coding."
tags: [llm-coding-inference, research, prediction-powered-inference, qualitative-coding]
---

Earlier steps of [llm-coding-inference](../../research/llm-coding-inference/) found that zero-shot Qwen2.5 coders (0.5B, 1.5B, 3B) gave tuned prediction-powered inference no narrower interval than hand-coding alone, and milestone 5f said that was what a coder at 0.60 to 0.70 agreement should give. That reading was wrong. On this corpus 32.7% of tweets are negative, so a constant "not negative" code already agrees 0.673. The 3B coder at 0.689 is almost that constant (sensitivity 0.07, specificity 0.99, Youden J 0.06); the synthetic coders at "agreement 0.70" in 5d to 5f had J of 0.40.

Milestone 5h gives each real coder a synthetic twin with the same sensitivity and specificity and independent errors. At an audit of 400 the real and matched interval-width ratios differ by at most 0.006 (3B: 0.993 against 0.987), so errors tied to the text cost nothing measurable beyond sens and spec. A 20% gain needs J near 0.5. One corpus, one prompt, in-sample best cut, one coder draw per cell. Numbers and the table: [`LOG.md`](../../research/llm-coding-inference/LOG.md).

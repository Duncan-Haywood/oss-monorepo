---
title: "A bigger zero-shot LLM coder did not narrow the interval: the threshold did"
seo_title: "A bigger zero-shot LLM coder did not narrow the interval"
date: 2026-10-26
description: "Qwen2.5 at 0.5B, 1.5B and 3B coded 6,000 Nigerian tweets; the valid PPI++ interval was narrowest for the middle model, because of where its Yes/No cut fell."
tags: [llm-coding-inference, research, ppi, qwen]
---

[llm-coding-inference](../../research/llm-coding-inference/) asks how much an LLM coder can shrink the human audit needed for valid regression estimates. Three Qwen2.5-Instruct sizes coded the same 6,000 NaijaSenti tweets zero-shot with one fixed prompt and the cut "score > 0".

At an audit of 400 the tuned PPI++ interval (HC3 + t) is 0.4% narrower than hand-coding for the 0.5B model, 2.2% for 1.5B and 0.7% for 3B. Not monotone in size. The 0.5B and 3B models call only 2.5% and 3.1% of tweets negative against a true 32.7%, so their binary codes carry almost nothing; 1.5B happened to be near-calibrated at zero. Coverage stayed at or above 93.1% everywhere.

Unchecked: a cut chosen on a held-out labelled split, which spends human labels, and models of 7B or more. One family, one prompt, one corpus. The log is [LOG.md](../../research/llm-coding-inference/LOG.md).

---
title: "A zero-shot 1.5B model narrows the valid interval by 2%: draft 1 of the LLM-coding paper"
seo_title: "A zero-shot 1.5B model narrows the valid interval by 2%"
date: 2026-10-26
description: "What a small local LLM coder buys when you need a valid confidence interval from hand-coded audits of 60 to 400 tweets."
tags: [research, llm-coding-inference, prediction-powered-inference]
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how small a hand-coded audit can be when an LLM codes the rest of a text corpus and you still want a valid interval. Draft 1 of its paper now carries the small-audit and real-LLM results.

With a leverage correction and t quantiles, tuned prediction-powered regression covers 93.2 to 94.9% at audits of 100 or more. A Qwen2.5-1.5B-Instruct zero-shot coder agrees with the human label on 66.1% of 6,000 NaijaSenti tweets, and makes the interval 2.2% narrower than hand-coding alone at 400 audited tweets (a naive Bayes trained in-language gets 3.4%). No coder reaches the 20% gain the break-even claim needs, so that hypothesis is untested, not refuted: one small model, one prompt, one corpus. The paper is not ready to submit; larger models and a second corpus are open.

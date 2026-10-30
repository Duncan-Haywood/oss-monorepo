---
title: "How many items to hand-code: the audit-size rule holds on a second corpus, and says a weak coder costs you"
date: 2026-10-26
description: "A closed-form rule for how many items to hand-check when an LLM codes the rest matched simulation to 0.2% on Reddit comments. A weak coder needs more."
tags: [llm-coding-inference, research, survey-methods, prediction-powered-inference]
---

If an automated coder labels a corpus and a person hand-checks a sample, how big must the sample be for a 95% interval of a given width? The [llm-coding-inference](../../research/llm-coding-inference/) programme has a closed-form answer (Neyman allocation with a finite-population term). Until now it had been checked on one corpus, NaijaSenti tweets.

This run checked it on a second: 6,683 GoEmotions Reddit comments grouped into four kinds of subreddit, with three stand-in coders (logistic regressions, not LLMs). The predicted half-width of the stratified interval matched the simulated one within 0.2% in all nine coder-by-design cells, and the rule's audit size gave mean half-widths of 3.00 and 2.00 points for 3- and 2-point targets, with coverage of 94.4 to 96.3% over 1,000 draws each.

I had predicted the coders would save at most 10% of the audit. The opposite happened: the coder-assisted plan needs 1.23 to 1.58 times as many hand-checked items as plain stratified human-only sampling. Their agreement with the human label is only 0.69 to 0.77, so the residual is noisier than the label, and the untuned estimator (lambda = 1) pays for it. The sizing rule is accurate and also says not to use that estimator with these coders. A rule for the tuned estimator (PPI++) is the next step.

Limits: one second corpus, groups I defined by hand, stand-in coders, plug-in variances taken from the whole corpus. Written with AI assistance. Log: `research/llm-coding-inference/LOG.md`, milestone 6o.

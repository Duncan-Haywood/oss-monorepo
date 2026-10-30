---
title: "Size an LLM-coding audit from a 400-item pilot"
date: 2026-10-27
description: "On 6,000 Nigerian tweets with three real Qwen coders, a 400-tweet pilot plans a hand-coding audit within 1% of the oracle size, and the coders save at most 5%."
tags: [llm-coding-inference, prediction-powered-inference, audit-design, research]
---

How many texts must people hand-code to check an LLM coder and still get a 3-point interval? The [`llm-coding-inference`](../../research/llm-coding-inference/) programme has a sizing rule, and last session it was only tested on stand-in coders. This session ran it on 6,000 NaijaSenti tweets (four languages) with zero-shot Qwen2.5 0.5B, 1.5B and 3B coders, 1,000 simulated audits per cell.

What held: a per-language control-variate weight never needs more audit than human-only coding, and the plan hit its target (mean half-width 3.00 and 2.00 points, coverage 93.7 to 95.9%). A pilot of 400 random tweets, used to estimate each language's weight and variance, planned an audit within about 1% of the oracle size (sd 31 to 62 tweets), with 88 to 93% of audits at or under 1.05 times the target.

What did not pay: the plain weight of 1 needed 3 to 47% *more* audit than human-only, and the tuned plan saved only 0.1 to 4.7%. The 1.5B coder saved most (4.7%), the 3B only 1.6%, so model size is not the lever. I had predicted the 3B would beat the 0.5B, which held, but only by a point.

One corpus, a fixed cut at score 0, no 7B coder. The pre-registered log is in the repository. Written with AI assistance; estimates only, not professional advice.

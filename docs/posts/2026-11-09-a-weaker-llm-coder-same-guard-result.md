---
title: "Does an audit rule tuned on a 1.5B LLM coder still work with a weaker 0.5B one?"
seo_title: "LLM-coded text audit: negative-cell guard with a weaker coder"
date: 2026-11-09
tags: [research, llm-coding-inference, audit-design]
description: "With a Qwen2.5-0.5B coder (Youden J 0.26) on GoEmotions, the negative-cell guard covers 95.4 to 96.6% and is 6 to 10% narrower than pooled at n = 2,000."
---

The llm-coding-inference programme asks how to get a valid confidence interval
for a rare category's prevalence when an LLM codes the text and humans audit a
sample. The rule that survived the last dozen milestones keeps one safeguard: use
the coder's labels to split the audit into cells only when the coder-negative
cell holds at least three pilot positives. It had only been checked with one
model, Qwen2.5-1.5B.

I scored the same 6,683 GoEmotions test comments for fear (1.15%) and sadness
(2.3%) with Qwen2.5-0.5B-Instruct, a coder with a Youden J of about 0.26, and
ran the same four cells (two categories, audit sizes 500 and 2,000, 500 draws).
I wrote the prediction first: coverage 93% or more everywhere.

It held. Coverage with the guard alone was 95.4 to 96.6%. At n = 2,000 the
intervals were 9.6% (fear) and 6.0% (sadness) narrower than the pooled design;
at n = 500 they were 1.9 and 3.4% wider. The gain is smaller than with the 1.5B
coder (17% and 29%) but not gone.

Limits: two categories, one corpus, one model family, one run per cell, so
coverage is only good to about 2 points. The library default is unchanged. A
second corpus is the next check.

Code, outputs and log: `research/llm-coding-inference/` (milestone 7aa).

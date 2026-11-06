---
title: "Does a pilot screen cost width when an LLM codes the text? Only when the audit is big"
seo_title: "LLM-coded text audits: does a pilot screen cost interval width?"
date: 2026-11-06
tags: [llm-coding-inference, research, statistics]
description: "On 6,683 GoEmotions comments coded by a 1.5B zero-shot LLM, a pilot screen cost 17 to 29% interval width at 2,000 audited items and nothing at 500."
---

When an LLM codes text and people audit a sample, a pilot decides whether to trust the coder's labels or fall back to plain human sampling. Does that safety screen throw away precision?

I reran the check on 6,683 GoEmotions comments, coded by a cached zero-shot Qwen2.5-1.5B-Instruct, for fear (1.15% prevalence), sadness (2.30%) and admiration (8.1%), with 500 simulated audits per cell. Keeping only a guard on pilot positives in the coder-negative cell covered 93.6 to 96.2% in all six cells. At 2,000 audited items it was 17% (fear), 29% (sadness) and 26% (admiration) narrower than plain sampling. At 500 items it was within 3%, 3% and 9% of it, so the screen costs nothing there because nothing is gaining.

I did not change the shipped default. One small coder on one corpus is not enough to remove a safeguard, and the earlier 85% coverage failure came from a guard that was too loose. Next: a second LLM or corpus.

Code and the full log: `research/llm-coding-inference/` (milestone 7y).

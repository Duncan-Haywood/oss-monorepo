---
title: "Does an LLM-coding audit need its screen? A held-out check on GoEmotions neutral"
seo_title: "LLM coding audit design: dropping the screen on a held-out category"
date: 2026-11-07
tags: [llm-coding-inference, research, statistics]
description: "With a weak zero-shot coder at 23% prevalence, the cell-based audit design covers about 94 to 96% and gains under 1% width over pooled. Harmless, not a win."
---

When an LLM codes a corpus and humans audit a sample, we can stratify the audit by the coder's labels. Our library falls back to a pooled design unless the pilot shows the coder is informative. Yesterday's runs suggested the extra screen only costs width at rare prevalence. Those categories were ones the default was tuned on, so I ran the held-out one we had cached: GoEmotions `neutral`, 23.3% prevalence, Qwen2.5-1.5B coder with Youden J of 0.19.

Over 500 draws each (binomial noise about 1.9 points): at an audit of 500 items, the pooled design covered 95.4%, the shipped default 95.8%, and the negative-cell guard alone 93.8%. At 2,000 items they covered 95.4%, 94.2% and 95.6%. The guard alone was at most 0.9% narrower than pooled. So at high prevalence with a weak coder nothing breaks and nothing is gained. I left the library default alone: one model and one corpus is not enough to remove a safeguard. A second LLM or corpus is the next test.

Details and files: `research/llm-coding-inference/LOG.md`, milestone 7z.

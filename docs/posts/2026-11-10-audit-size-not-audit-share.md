---
title: "It was the audit's size, not its share of the corpus"
seo_title: "LLM-coded data audits: audit size, not sampling share, sets the gain"
date: 2026-11-10
tags: [research, llm, statistics, qualitative-coding]
description: "Shrinking the corpus separated audit size from sampling fraction: the gain from stratifying a hand-coded audit by the LLM coder's labels follows size."
---

Earlier today the [llm-coding-inference](../../research/llm-coding-inference/)
programme read 18 results together and found that stratifying a hand-coded audit
by the LLM coder's yes/no labels only narrowed the interval when the audit was
about a third of the corpus. Every one of those cells had 2,000 audited items,
so size and share were tangled.

Milestone 7ae pulled them apart. It shrank the GoEmotions corpus (6,683 Reddit
comments, coded zero-shot by Qwen2.5-1.5B-Instruct) so that a 500-item audit
was 7.5%, 15% or 30% of it, and compared 500, 1,000 and 2,000-item audits at the
same 30% share. 1,000 draws per cell.

| category (prevalence) | n = 500 | n = 1,000 | n = 2,000 |
|---|---|---|---|
| sadness (2.3%) | 0.942 | 0.819 | 0.715 |
| admiration (8.1%) | 0.863 | 0.754 | 0.747 |
| fear (1.2%) | 0.979 | 0.901 | 0.822 |

*Interval width with the guarded coder-cell audit divided by width with a plain
random audit, all at an audit share of 30%. Lower is better.*

At a fixed 500 items, raising the share from 7.5% to 30% moved the ratio by only
0.03 to 0.04. The prediction, written before the runs, said share would drive it;
that part was refuted. The reason is in the rule itself: it uses the coder's
cells only when the pilot holds at least three human positives the coder missed,
an absolute count that grows with the pilot, not with the sampling fraction.
Coverage of the 95% interval stayed between 93.6% and 96.7% in all 15 cells.

One corpus, one coder, one run per cell. The full entry, with limits, is in the
[research log](../../research/llm-coding-inference/LOG.md).

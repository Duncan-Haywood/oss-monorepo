---
title: "Can you tell before an audit how often the rare-category guard will switch on?"
seo_title: "Forecasting the negative-cell guard for LLM-coded audits"
date: 2026-11-10
tags: [research, llm-coding-inference, qualitative-coding]
description: "A closed-form chance that a hand-coded pilot passes the rare-category guard matches 36 audit simulations within 3.2 points, after the simpler forecast I committed to missed five."
---

When an LLM codes a corpus and people hand-check a sample, the
`llm-coding-inference` library only splits the audit by the coder's labels if
the pilot holds at least three positives the coder missed. The previous step
found that this guard depends on how many items the audit has, not on what
share of the corpus they are. So a planner should be able to work out, before
labelling anything, how often the guard will let the split happen.

I wrote down a forecast first: the chance that a random pilot holds three or
more of the coder's misses (a hypergeometric tail). Then I checked it against
all 36 committed audit cells (GoEmotions with two Qwen2.5 sizes, NaijaSenti
natural and thinned). It was within tolerance in 31 and ran high in five,
worst with the weaker 0.5B model: 34% forecast, 18% observed.

The reason, found after seeing the misses: the rule also needs the pilot's
estimate of the coder's skill to be non-negative, and that fails when the pilot
has misses but no positive the coder caught. The exact chance of both
conditions, now `audit_design.cells_probability`, lands within 3.2 points in
all 36 cells. I fitted that explanation after looking at the data, so it still
needs a fresh, pre-registered set of cells. The other claim I committed to,
that the forecast ranks the width gain better than the audit's share of the
corpus, was refuted.

Rule of thumb for planning: the pilot needs about 5.3 / (prevalence x (1 -
sensitivity)) items, about 1,060 at 1% prevalence for a coder that finds half
the positives. Details are in `research/llm-coding-inference/LOG.md`
(milestone 7af). Written with AI assistance.

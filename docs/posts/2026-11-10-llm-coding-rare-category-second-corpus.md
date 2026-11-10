---
title: "Does the small-audit rule for LLM-coded data hold for a rare category on a second corpus?"
seo_title: "Audit size for LLM-coded data: rare category on NaijaSenti"
date: 2026-11-10
tags: [research, llm-coding-inference, qualitative-coding]
description: "A negative-cell guard keeps confidence intervals valid for rare categories in LLM-coded text; a second corpus at 1% and 3% prevalence agrees."
---

When an LLM codes a text corpus and people hand-check a sample, a rare category
is where interval estimates break. The `llm-coding-inference` programme ships a
rule (`neg_guard = 3`) that needs at least three hand-labelled positives among
items the coder called negative. Until now it had been checked on GoEmotions
and on a common NaijaSenti category (33%).

Today's step thinned the NaijaSenti negative share to 1% and 3% of 30,000 items
(a constructed prevalence on real tweets) and ran 1,000 audit draws at n = 1,000
and 3,000. The guard-only rule covered 94.3 to 96.2% in all four cells, against
94.3 to 95.2% for plain pooled sampling, and its intervals were 0 to 8% narrower.
The older default never switched on at n = 1,000, so it matched pooled.

Caveats: one coder, one run per cell, a thinned rather than naturally rare
category. Details are in `research/llm-coding-inference/LOG.md` (milestone 7ac).

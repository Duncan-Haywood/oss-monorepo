---
title: "Do coder cells help when the category is rare?"
seo_title: "Auditing LLM-coded qualitative data for rare categories: stratified vs pooled intervals"
date: 2026-11-03
tags: [research, llm-coding, statistics, inference]
description: "Splitting an audit by the LLM's own code makes intervals 6 to 11% narrower for rare categories, but at 2% prevalence coverage drops to 91%."
---

When an LLM codes a text corpus and you hand-check a sample to get a valid interval, you can split the audit by the model's own code (a "cell" design) or pool it. Last session's result was that, at 30% prevalence, cells gained almost nothing over a pooled audit with a fitted control-variate weight (ratio 0.995).

Rare categories are where that weight is noisy, so I re-ran the comparison on NaijaSenti with prevalence set to 2%, 5% and 10% (n = 1000, 1,000 draws each). Cells were 11%, 8% and 6% narrower at fitted lambda. The catch: at 2% prevalence the cells interval covered the truth 91.1% of the time against a 95% target, with about six pilot positives per draw. At 5% and 10% coverage was 95.8% and 94.2%.

So on this one corpus and coder, cells pay off for rare categories only above roughly 5% prevalence at this audit size. A minimum-positives guard is the obvious fix and is next. Code and numbers: `research/llm-coding-inference/experiments/h7m_rare_cells.py` and its `.txt`; log entry 7n.

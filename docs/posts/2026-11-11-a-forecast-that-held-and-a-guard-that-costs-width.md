---
title: "A forecast that held on fresh cells, and the width a useless coder costs"
seo_title: "LLM coding audit: forecasting when stratified audits pay"
date: 2026-11-11
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 12 new NaijaSenti cells: the audit forecast held within 3.2 points, and a near-useless coder made intervals up to 14% wider."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
small a hand-coded audit can be when a model does the bulk of the coding. Its audit
rule uses the coder's own labels as strata only when a pilot finds at least three
positives the coder missed. Yesterday's step explained how often that happens with
a formula, `cells_probability`, but the formula was found after looking at the same
36 cells it explained.

Today I wrote down its forecasts for 12 cells nobody had run (NaijaSenti tweets with
negatives thinned to 2%, 5% and 10%; an in-language naive-Bayes coder and an English
lexicon; audits of 600 and 2,000), committed them, and only then ran 1,000 simulated
audits per cell.

- The forecast held in all 12 cells, the largest gap 3.2 points. In the lexicon cells
  the simpler miss-count formula says 99.9%; the observed share was 34.7%, and the
  exact forecast said 37.3%.
- Coverage of the 95% interval stayed between 93.7% and 96.4%.
- One prediction failed. With the lexicon coder (informedness 0.03, close to none) the
  rule's intervals were 1.7% to 13.5% *wider* than a plain random audit in every cell.
  The in-language coder's were up to 7% narrower.

So the guard keeps coverage honest, but on its own it lets a coder with no signal
cost width. A small minimum informedness screen still earns its place; which value is
the next pre-registered test. One corpus, one run per cell. Details:
[LOG.md](../../research/llm-coding-inference/LOG.md).
